import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TIME_CONSTANTS } from "@ccflare/core";
import { isRecord } from "@ccflare/types";
import type {
	AckMessage,
	ControlMessage,
	IncomingWorkerMessage,
	OutgoingWorkerMessage,
	ReadyMessage,
	ShutdownCompleteMessage,
} from "./worker-messages";

export interface UsageWorkerTransport {
	postMessage(message: IncomingWorkerMessage): void;
}

export interface WorkerLike {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: MessageEvent<unknown>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
	unref?: () => void;
}

export interface UsageWorkerLogger {
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	debug(message: string, ...args: unknown[]): void;
}

export interface UsageWorkerHealthSnapshot {
	state: "starting" | "ready" | "shutting_down" | "stopped";
	queuedMessages: number;
	pendingAcks: number;
	lastError: string | null;
}

interface UsageWorkerControllerOptions {
	createWorker?: () => WorkerLike;
	onWorkerMessage?: (message: OutgoingWorkerMessage) => void;
	readyTimeoutMs?: number;
	ackTimeoutMs?: number;
	shutdownDelayMs?: number;
	logger?: UsageWorkerLogger;
}

type DecoratedIncomingWorkerMessage = IncomingWorkerMessage & {
	messageId: string;
};

interface PendingAck {
	message: DecoratedIncomingWorkerMessage;
	timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_READY_TIMEOUT_MS = Number(
	process.env.CF_USAGE_WORKER_READY_TIMEOUT_MS ||
		TIME_CONSTANTS.RETRY_DELAY_DEFAULT * 5,
);
const DEFAULT_ACK_TIMEOUT_MS = Number(
	process.env.CF_USAGE_WORKER_ACK_TIMEOUT_MS ||
		TIME_CONSTANTS.RETRY_DELAY_DEFAULT * 5,
);
const DEFAULT_SHUTDOWN_DELAY_MS = 100;

function noop(): void {}

function createDefaultLogger(): UsageWorkerLogger {
	return {
		info: noop,
		warn: noop,
		error: noop,
		debug: noop,
	};
}

export function resolveUsageWorkerEntrypoint(): string {
	const configuredPath = process.env.CF_USAGE_WORKER_PATH?.trim();
	if (!configuredPath) {
		return new URL("./post-processor.worker.ts", import.meta.url).href;
	}

	if (configuredPath.startsWith("file://")) {
		return configuredPath;
	}

	const absolutePath = isAbsolute(configuredPath)
		? configuredPath
		: resolve(process.cwd(), configuredPath);
	return pathToFileURL(absolutePath).href;
}

function createDefaultWorker(): WorkerLike {
	return new Worker(resolveUsageWorkerEntrypoint(), {
		smol: true,
	}) as unknown as WorkerLike;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
	timer.unref?.();
}

function getEventMessage(event: ErrorEvent): string {
	if (typeof event.message === "string" && event.message.length > 0) {
		return event.message;
	}

	if (event.error instanceof Error && event.error.message.length > 0) {
		return event.error.message;
	}

	return "Unknown usage worker error";
}

function isReadyMessage(value: unknown): value is ReadyMessage {
	return isRecord(value) && value.type === "ready";
}

function isAckMessage(value: unknown): value is AckMessage {
	return (
		isRecord(value) &&
		value.type === "ack" &&
		typeof value.messageId === "string"
	);
}

function isShutdownCompleteMessage(
	value: unknown,
): value is ShutdownCompleteMessage {
	return (
		isRecord(value) &&
		value.type === "shutdown-complete" &&
		isRecord(value.asyncWriter) &&
		typeof value.asyncWriter.healthy === "boolean" &&
		typeof value.asyncWriter.failureCount === "number" &&
		typeof value.asyncWriter.queuedJobs === "number"
	);
}

export class UsageWorkerController implements UsageWorkerTransport {
	private readonly createWorkerImpl: () => WorkerLike;
	private readonly onWorkerMessage?: (message: OutgoingWorkerMessage) => void;
	private readonly readyTimeoutMs: number;
	private readonly ackTimeoutMs: number;
	private readonly shutdownDelayMs: number;
	private readonly logger: UsageWorkerLogger;
	private worker: WorkerLike | null = null;
	private ready = false;
	private shuttingDown = false;
	private generation = 0;
	private readyTimer: ReturnType<typeof setTimeout> | null = null;
	private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly queuedMessages: DecoratedIncomingWorkerMessage[] = [];
	private readonly pendingAcks = new Map<string, PendingAck>();
	private shutdownPromise: Promise<void> | null = null;
	private resolveShutdown: (() => void) | null = null;
	private rejectShutdown: ((error: Error) => void) | null = null;
	private lastError: string | null = null;
	// Guards terminateGracefully() re-entrancy for the FULL async flow (including the
	// wait-for-ready phase below, which happens before shutdownPromise exists), so a
	// second concurrent call always reuses the first call's in-flight promise instead
	// of starting a duplicate termination sequence.
	private terminatePromise: Promise<void> | null = null;
	// Resolved (with whether the worker became ready) by handleWorkerMessage's ready
	// branch, or forced to `false` if the worker crashes/errors while shutting down, so
	// terminateGracefully()'s bounded wait below never has to rely solely on its own
	// timeout to make progress.
	private readyWaiters: Array<(isReady: boolean) => void> = [];
	// Set by finishShutdown() when it is called WITH an error while a
	// terminateGracefully() call is still suspended in its wait-for-ready phase (e.g. a
	// concurrent forceTerminate(), or a worker crash) -- at that point shutdownPromise
	// does not exist yet, so resolveShutdown/rejectShutdown are still null and the
	// error would otherwise be silently swallowed. runGracefulTermination() checks this
	// after its wait and re-throws it, so the caller's promise correctly rejects
	// instead of resolving as if shutdown had completed normally.
	private earlyTerminationError: Error | null = null;

	constructor(options: UsageWorkerControllerOptions = {}) {
		this.createWorkerImpl = options.createWorker ?? createDefaultWorker;
		this.onWorkerMessage = options.onWorkerMessage;
		this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
		this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
		this.shutdownDelayMs = options.shutdownDelayMs ?? DEFAULT_SHUTDOWN_DELAY_MS;
		this.logger = options.logger ?? createDefaultLogger();
		this.startWorker();
	}

	postMessage(message: IncomingWorkerMessage): void {
		if (this.shuttingDown) {
			this.logger.warn(
				"Dropping usage worker message because the worker is shutting down",
			);
			return;
		}

		const decoratedMessage: DecoratedIncomingWorkerMessage = {
			...message,
			messageId: crypto.randomUUID(),
		};

		if (!this.ready || !this.worker) {
			this.queuedMessages.push(decoratedMessage);
			return;
		}

		this.sendMessage(decoratedMessage);
	}

	isShuttingDown(): boolean {
		return this.shuttingDown;
	}

	getHealthSnapshot(): UsageWorkerHealthSnapshot {
		const state = !this.worker
			? "stopped"
			: this.shuttingDown
				? "shutting_down"
				: this.ready
					? "ready"
					: "starting";

		return {
			state,
			queuedMessages: this.queuedMessages.length,
			pendingAcks: this.pendingAcks.size,
			lastError: this.lastError,
		};
	}

	terminateGracefully(): Promise<void> {
		if (this.terminatePromise) {
			return this.terminatePromise;
		}

		this.terminatePromise = this.runGracefulTermination();
		return this.terminatePromise;
	}

	// Previously this cleared queuedMessages synchronously and unconditionally, which
	// silently dropped any usage/analytics message that was queued (worker not yet
	// ready) at the moment shutdown was triggered -- losing that request's log entry
	// forever. Now, if there is something queued and the worker isn't ready yet, we
	// give it up to readyTimeoutMs to become ready and flush before giving up (and
	// only THEN do we drop + warn, instead of dropping silently up front).
	private async runGracefulTermination(): Promise<void> {
		this.shuttingDown = true;
		this.clearReadyTimer();
		// Discard any stale error left over from an earlier, unrelated termination
		// cycle on this same controller instance (e.g. a standalone forceTerminate()
		// call that fired with nothing racing it) -- only an error produced DURING
		// this call's own wait below should ever be observed at the check further down.
		this.earlyTerminationError = null;

		if (this.worker && this.queuedMessages.length > 0 && !this.ready) {
			const becameReady = await this.waitForReady(this.readyTimeoutMs);
			if (becameReady) {
				this.flushQueuedMessages();
			}
		}

		if (this.earlyTerminationError) {
			const error = this.earlyTerminationError;
			this.earlyTerminationError = null;
			// finishShutdown() already reset shuttingDown/worker/etc for whichever path
			// (forceTerminate / crash) produced this error -- just propagate it so the
			// original terminateGracefully() caller sees a rejection instead of a
			// silent success.
			throw error;
		}

		this.ready = false;
		this.clearPendingAcks();
		if (this.queuedMessages.length > 0) {
			this.logger.warn(
				`Dropping ${this.queuedMessages.length} queued usage worker message(s) that could not be flushed before shutdown`,
			);
			this.queuedMessages.length = 0;
		}

		const worker = this.worker;
		if (!worker) {
			this.shuttingDown = false;
			return;
		}

		this.shutdownPromise = new Promise<void>((resolve, reject) => {
			this.resolveShutdown = resolve;
			this.rejectShutdown = reject;
		});
		const shutdownPromise = this.shutdownPromise;

		const shutdownMessage: ControlMessage = {
			type: "shutdown",
			messageId: crypto.randomUUID(),
		};

		try {
			worker.postMessage(shutdownMessage);
		} catch (error) {
			this.logger.debug(
				"Failed to post shutdown message to usage worker before termination",
				error,
			);
		}

		if (this.shutdownDelayMs <= 0) {
			this.finishShutdown(worker);
			return shutdownPromise;
		}

		this.shutdownTimer = setTimeout(() => {
			this.shutdownTimer = null;
			this.finishShutdown(
				worker,
				new Error(
					"Usage worker did not confirm shutdown before the timeout elapsed",
				),
			);
		}, this.shutdownDelayMs);
		unrefTimer(this.shutdownTimer);
		return shutdownPromise;
	}

	forceTerminate(): void {
		this.shuttingDown = true;
		this.clearReadyTimer();
		// Unblock any terminateGracefully() call currently suspended in its
		// wait-for-ready phase (see runGracefulTermination/waitForReady below) --
		// otherwise that caller's promise would not settle until readyTimeoutMs
		// elapses even though this worker is being torn down right now. Mirrors the
		// same unblock done in the onerror/onmessageerror shutdown-crash branches.
		this.resolveReadyWaiters(false);

		// Best-effort, zero-wait flush: forceTerminate() must stay non-blocking (no
		// await), so only flush if the worker already happens to be ready right now --
		// never wait for readiness the way terminateGracefully() does.
		if (this.ready) {
			this.flushQueuedMessages();
		}
		this.ready = false;
		this.clearPendingAcks();
		if (this.queuedMessages.length > 0) {
			this.logger.warn(
				`Dropping ${this.queuedMessages.length} queued usage worker message(s) on force termination`,
			);
			this.queuedMessages.length = 0;
		}
		if (this.shutdownTimer) {
			clearTimeout(this.shutdownTimer);
			this.shutdownTimer = null;
		}

		const worker = this.worker;
		this.finishShutdown(worker, new Error("Usage worker was force terminated"));
	}

	// Resolves to true once a "ready" message arrives, or false if readiness is not
	// reached within timeoutMs, or if the worker crashes/errors while shutting down.
	// Always resolves (never rejects) and never hangs past timeoutMs, so this can't
	// make terminateGracefully() hang indefinitely.
	private waitForReady(timeoutMs: number): Promise<boolean> {
		if (this.ready) {
			return Promise.resolve(true);
		}

		return new Promise<boolean>((resolve) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout>;
			const settle = (isReady: boolean) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				const index = this.readyWaiters.indexOf(settle);
				if (index !== -1) {
					this.readyWaiters.splice(index, 1);
				}
				resolve(isReady);
			};

			this.readyWaiters.push(settle);
			timer = setTimeout(() => settle(false), timeoutMs);
			unrefTimer(timer);
		});
	}

	private resolveReadyWaiters(isReady: boolean): void {
		if (this.readyWaiters.length === 0) {
			return;
		}
		const waiters = this.readyWaiters.splice(0, this.readyWaiters.length);
		for (const settle of waiters) {
			settle(isReady);
		}
	}

	private startWorker(): void {
		if (this.shuttingDown) {
			return;
		}

		const worker = this.createWorkerImpl();
		this.worker = worker;
		this.ready = false;
		this.generation += 1;
		const generation = this.generation;

		worker.onmessage = (event) => {
			if (this.worker !== worker || generation !== this.generation) {
				return;
			}

			this.handleWorkerMessage(event.data);
		};

		worker.onerror = (event) => {
			if (this.worker !== worker || generation !== this.generation) {
				return;
			}

			const message = getEventMessage(event);
			this.lastError = message;
			this.logger.error(`Usage worker crashed: ${message}`);
			if (this.shuttingDown) {
				// Unblock any pending terminateGracefully() wait-for-ready immediately
				// instead of leaving it to idle out its own timeout -- the worker is gone,
				// it will never become ready.
				this.resolveReadyWaiters(false);
				this.finishShutdown(
					worker,
					new Error(`Usage worker crashed during shutdown: ${message}`),
				);
				return;
			}
			this.restartWorker();
		};

		worker.onmessageerror = () => {
			if (this.worker !== worker || generation !== this.generation) {
				return;
			}

			this.lastError = "Usage worker emitted an invalid message payload";
			this.logger.error("Usage worker emitted an invalid message payload");
			if (this.shuttingDown) {
				this.resolveReadyWaiters(false);
				this.finishShutdown(
					worker,
					new Error("Usage worker emitted an invalid message during shutdown"),
				);
				return;
			}
			this.restartWorker();
		};

		worker.unref?.();
		this.armReadyTimeout(worker, generation);
	}

	private armReadyTimeout(worker: WorkerLike, generation: number): void {
		this.clearReadyTimer();
		const timer = setTimeout(() => {
			if (
				this.shuttingDown ||
				this.worker !== worker ||
				generation !== this.generation ||
				this.ready
			) {
				return;
			}

			this.logger.warn(
				"Usage worker did not become ready before the liveness timeout; restarting it",
			);
			this.restartWorker();
		}, this.readyTimeoutMs);
		unrefTimer(timer);
		this.readyTimer = timer;
	}

	private clearReadyTimer(): void {
		if (!this.readyTimer) {
			return;
		}

		clearTimeout(this.readyTimer);
		this.readyTimer = null;
	}

	private clearPendingAcks(): void {
		for (const pending of this.pendingAcks.values()) {
			clearTimeout(pending.timer);
		}
		this.pendingAcks.clear();
	}

	private handleWorkerMessage(message: unknown): void {
		if (isShutdownCompleteMessage(message)) {
			this.lastError = message.asyncWriter.healthy
				? this.lastError
				: `Usage worker async writer recorded ${message.asyncWriter.failureCount} failure(s)`;
			if (message.asyncWriter.healthy) {
				this.finishShutdown(this.worker);
			} else {
				this.finishShutdown(
					this.worker,
					new Error(
						`Usage worker async writer recorded ${message.asyncWriter.failureCount} failure(s) during shutdown`,
					),
				);
			}
			return;
		}

		if (isReadyMessage(message)) {
			this.ready = true;
			this.lastError = null;
			this.clearReadyTimer();
			// Unblock any terminateGracefully() wait-for-ready call unconditionally --
			// this must run even while shuttingDown, otherwise a ready-signal that
			// arrives during the shutdown window would be silently ignored and the
			// bounded wait below would have to idle out its full timeout instead of
			// resolving immediately.
			this.resolveReadyWaiters(true);
			// The explicit wait-then-flush path in runGracefulTermination() already
			// handles flushing for the shutdown case; only auto-flush here when we are
			// NOT shutting down, to avoid a double-flush race with that path.
			if (!this.shuttingDown) {
				this.flushQueuedMessages();
			}
			return;
		}

		if (this.shuttingDown) {
			return;
		}

		if (isAckMessage(message)) {
			const pendingAck = this.pendingAcks.get(message.messageId);
			if (!pendingAck) {
				return;
			}

			clearTimeout(pendingAck.timer);
			this.pendingAcks.delete(message.messageId);
			return;
		}

		this.onWorkerMessage?.(message as OutgoingWorkerMessage);
	}

	private flushQueuedMessages(): void {
		if (!this.worker || !this.ready || this.queuedMessages.length === 0) {
			return;
		}

		const queuedMessages = this.queuedMessages.splice(
			0,
			this.queuedMessages.length,
		);
		for (const message of queuedMessages) {
			this.sendMessage(message);
		}
	}

	private sendMessage(message: DecoratedIncomingWorkerMessage): void {
		if (!this.worker) {
			this.queuedMessages.push(message);
			return;
		}

		try {
			this.worker.postMessage(message);
		} catch (error) {
			this.logger.error("Failed to post a message to the usage worker", error);
			this.restartWorker();
			return;
		}

		if (message.type === "shutdown") {
			return;
		}

		const timer = setTimeout(() => {
			const pendingAck = this.pendingAcks.get(message.messageId);
			if (!pendingAck) {
				return;
			}

			this.pendingAcks.delete(message.messageId);
			this.logger.warn(
				"Usage worker became unresponsive while waiting for an acknowledgement; restarting it",
			);
			this.restartWorker();
		}, this.ackTimeoutMs);
		unrefTimer(timer);

		this.pendingAcks.set(message.messageId, {
			message,
			timer,
		});
	}

	private restartWorker(): void {
		if (this.shuttingDown) {
			return;
		}

		this.clearReadyTimer();

		const pendingAckCount = this.pendingAcks.size;
		if (pendingAckCount > 0) {
			const requestIds = Array.from(
				new Set(
					Array.from(this.pendingAcks.values())
						.map((pending) =>
							"requestId" in pending.message
								? pending.message.requestId
								: undefined,
						)
						.filter(
							(requestId): requestId is string => typeof requestId === "string",
						),
				),
			);
			this.logger.warn(
				`Dropped ${pendingAckCount} in-flight usage worker messages during restart${
					requestIds.length > 0 ? ` (${requestIds.join(", ")})` : ""
				}`,
			);
		}

		this.clearPendingAcks();
		this.ready = false;

		const worker = this.worker;
		this.worker = null;

		try {
			worker?.terminate();
		} catch (error) {
			this.logger.debug("Failed to terminate the usage worker cleanly", error);
		}

		this.startWorker();
	}

	private finishShutdown(worker: WorkerLike | null, error?: Error): void {
		if (this.shutdownTimer) {
			clearTimeout(this.shutdownTimer);
			this.shutdownTimer = null;
		}

		if (this.worker === worker) {
			this.worker = null;
			this.generation += 1;
		}

		try {
			worker?.terminate();
		} catch (terminateError) {
			if (!error) {
				error =
					terminateError instanceof Error
						? terminateError
						: new Error(String(terminateError));
			}
		}

		this.ready = false;
		this.shuttingDown = false;

		const resolveShutdown = this.resolveShutdown;
		const rejectShutdown = this.rejectShutdown;
		this.resolveShutdown = null;
		this.rejectShutdown = null;
		this.shutdownPromise = null;
		// Reset so a controller that gets restarted/reused after a full shutdown
		// (e.g. crash-during-shutdown, see onerror above) is not permanently stuck
		// returning an already-settled promise from a future terminateGracefully() call.
		this.terminatePromise = null;

		if (error) {
			this.lastError = error.message;
			if (rejectShutdown) {
				rejectShutdown(error);
			} else {
				// No in-flight shutdownPromise to reject (finishShutdown fired while a
				// terminateGracefully() call was still awaiting waitForReady, before
				// shutdownPromise existed) -- stash it for runGracefulTermination to
				// re-throw once its wait resolves.
				this.earlyTerminationError = error;
			}
			return;
		}

		resolveShutdown?.();
	}
}
