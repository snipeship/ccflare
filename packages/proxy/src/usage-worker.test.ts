import { afterEach, describe, expect, it } from "bun:test";
import {
	resolveUsageWorkerEntrypoint,
	UsageWorkerController,
	type WorkerLike,
} from "./usage-worker";
import type {
	AckMessage,
	ReadyMessage,
	ShutdownCompleteMessage,
	StartMessage,
	SummaryMessage,
} from "./worker-messages";

function createStartMessage(): StartMessage {
	return {
		type: "start",
		requestId: "req-1",
		accountId: "account-1",
		method: "POST",
		path: "/v1/openai/responses",
		upstreamPath: "/responses",
		timestamp: Date.now(),
		requestHeaders: {},
		requestBody: null,
		responseStatus: 200,
		responseHeaders: {
			"content-type": "application/json",
		},
		isStream: false,
		providerName: "openai",
		retryAttempt: 0,
		failoverAttempts: 0,
	};
}

async function waitFor(
	condition: () => boolean,
	timeoutMs = 250,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (condition()) {
			return;
		}

		await Bun.sleep(5);
	}

	throw new Error("Timed out waiting for condition");
}

class TestLogger {
	readonly warnings: string[] = [];
	readonly errors: string[] = [];

	info(): void {}

	debug(): void {}

	warn(message: string): void {
		this.warnings.push(message);
	}

	error(message: string): void {
		this.errors.push(message);
	}
}

class FakeWorker implements WorkerLike {
	onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
	readonly postedMessages: unknown[] = [];
	terminateCalls = 0;
	unrefCalls = 0;

	postMessage(message: unknown): void {
		this.postedMessages.push(message);
	}

	terminate(): void {
		this.terminateCalls += 1;
	}

	unref(): void {
		this.unrefCalls += 1;
	}

	emitMessage(
		message:
			| ReadyMessage
			| AckMessage
			| ShutdownCompleteMessage
			| SummaryMessage,
	): void {
		this.onmessage?.({ data: message } as MessageEvent<unknown>);
	}

	emitError(message: string): void {
		this.onerror?.({ message } as ErrorEvent);
	}

	emitMessageError(data: unknown): void {
		this.onmessageerror?.({ data } as MessageEvent<unknown>);
	}
}

const controllers: UsageWorkerController[] = [];
const originalUsageWorkerPath = process.env.CF_USAGE_WORKER_PATH;

afterEach(async () => {
	for (const controller of controllers) {
		await controller.terminateGracefully().catch(() => {});
	}
	controllers.length = 0;

	if (originalUsageWorkerPath === undefined) {
		delete process.env.CF_USAGE_WORKER_PATH;
	} else {
		process.env.CF_USAGE_WORKER_PATH = originalUsageWorkerPath;
	}
});

describe("UsageWorkerController", () => {
	it("resolves an explicit usage worker path from the environment", () => {
		process.env.CF_USAGE_WORKER_PATH = "/tmp/post-processor.worker.js";

		expect(resolveUsageWorkerEntrypoint()).toBe(
			"file:///tmp/post-processor.worker.js",
		);
	});

	it("queues outgoing messages until the worker sends ready", async () => {
		const workers: FakeWorker[] = [];
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger: new TestLogger(),
		});
		controllers.push(controller);

		controller.postMessage(createStartMessage());

		expect(workers).toHaveLength(1);
		expect(workers[0]?.postedMessages).toHaveLength(0);
		expect(typeof workers[0]?.onerror).toBe("function");
		expect(typeof workers[0]?.onmessageerror).toBe("function");

		workers[0]?.emitMessage({ type: "ready" });

		expect(workers[0]?.postedMessages).toHaveLength(1);
		expect(workers[0]?.postedMessages[0]).toMatchObject({
			type: "start",
			requestId: "req-1",
			messageId: expect.any(String),
		});
	});

	it("restarts the worker when the ready handshake never arrives", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 15,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		await waitFor(() => workers.length >= 2);
		workers[1]?.emitMessage({ type: "ready" });

		expect(workers[0]?.terminateCalls).toBe(1);
		expect(logger.warnings).toContain(
			"Usage worker did not become ready before the liveness timeout; restarting it",
		);
	});

	it("restarts the worker when an acknowledgement does not arrive", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 15,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		workers[0]?.emitMessage({ type: "ready" });
		controller.postMessage(createStartMessage());

		await waitFor(() => workers.length >= 2);
		workers[1]?.emitMessage({ type: "ready" });

		expect(workers[0]?.terminateCalls).toBe(1);
		expect(logger.warnings).toContain(
			"Usage worker became unresponsive while waiting for an acknowledgement; restarting it",
		);
	});

	it("restarts the worker after worker errors and message errors", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		workers[0]?.emitMessage({ type: "ready" });
		workers[0]?.emitError("worker crashed");

		await waitFor(() => workers.length >= 2);
		workers[1]?.emitMessage({ type: "ready" });
		workers[1]?.emitMessageError({ bad: true });

		await waitFor(() => workers.length >= 3);
		workers[2]?.emitMessage({ type: "ready" });

		expect(logger.errors).toEqual([
			"Usage worker crashed: worker crashed",
			"Usage worker emitted an invalid message payload",
		]);
	});

	it("awaits shutdown completion before terminating the worker", async () => {
		const workers: FakeWorker[] = [];
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 1_000,
			logger: new TestLogger(),
		});
		controllers.push(controller);

		workers[0]?.emitMessage({ type: "ready" });
		const shutdownPromise = controller.terminateGracefully();

		expect(workers[0]?.postedMessages.at(-1)).toMatchObject({
			type: "shutdown",
			messageId: expect.any(String),
		});
		expect(workers[0]?.terminateCalls).toBe(0);

		workers[0]?.emitMessage({
			type: "shutdown-complete",
			asyncWriter: {
				healthy: true,
				failureCount: 0,
				queuedJobs: 0,
			},
		});

		await shutdownPromise;
		expect(workers[0]?.terminateCalls).toBe(1);
		expect(controller.getHealthSnapshot().state).toBe("stopped");
	});

	it("flushes a message queued just before shutdown once the worker becomes ready during the wait, instead of dropping it", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 200,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		// Worker is not ready yet, so this queues instead of sending immediately --
		// this is the exact scenario that used to lose the message on shutdown.
		controller.postMessage(createStartMessage());
		expect(workers[0]?.postedMessages).toHaveLength(0);

		const shutdownPromise = controller.terminateGracefully();

		// Ready arrives DURING the shutdown wait window (before readyTimeoutMs elapses).
		await Bun.sleep(5);
		workers[0]?.emitMessage({ type: "ready" });

		await waitFor(
			() =>
				workers[0]?.postedMessages.some(
					(message) => (message as { type?: string }).type === "start",
				) ?? false,
		);

		workers[0]?.emitMessage({
			type: "shutdown-complete",
			asyncWriter: { healthy: true, failureCount: 0, queuedJobs: 0 },
		});

		await shutdownPromise;
		expect(
			logger.warnings.some((warning) => warning.includes("Dropping")),
		).toBe(false);
	});

	it("resolves shutdown within readyTimeoutMs + shutdownDelayMs (never hangs) and drops queued messages with a warning when the worker never becomes ready", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const readyTimeoutMs = 30;
		const shutdownDelayMs = 20;
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs,
			ackTimeoutMs: 10_000,
			shutdownDelayMs,
			logger,
		});
		controllers.push(controller);

		// Worker never emits "ready" in this test.
		controller.postMessage(createStartMessage());
		expect(workers[0]?.postedMessages).toHaveLength(0);

		const startedAt = Date.now();
		await expect(controller.terminateGracefully()).rejects.toThrow();
		const elapsedMs = Date.now() - startedAt;

		// Generous slack for test-runner scheduling jitter -- the point is this is
		// BOUNDED (readyTimeoutMs + shutdownDelayMs), not that it hangs indefinitely.
		expect(elapsedMs).toBeLessThan(readyTimeoutMs + shutdownDelayMs + 1_000);
		expect(
			logger.warnings.some((warning) =>
				warning.includes("Dropping 1 queued usage worker message"),
			),
		).toBe(true);
		expect(workers[0]?.terminateCalls).toBe(1);
	});

	it("force termination flushes a queued message only if the worker is already ready, without waiting", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		workers[0]?.emitMessage({ type: "ready" });
		controller.postMessage(createStartMessage());
		expect(workers[0]?.postedMessages).toHaveLength(1);

		controller.forceTerminate();

		expect(workers[0]?.terminateCalls).toBe(1);
		expect(
			logger.warnings.some((warning) => warning.includes("Dropping")),
		).toBe(false);
	});

	it("promptly rejects an in-flight terminateGracefully() wait when forceTerminate() races it, instead of idling out the full readyTimeoutMs", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const readyTimeoutMs = 300;
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		// Worker never becomes ready, so terminateGracefully() below enters its
		// wait-for-ready phase and suspends for up to readyTimeoutMs.
		controller.postMessage(createStartMessage());
		const gracefulShutdown = controller.terminateGracefully();

		// Race it with a forceTerminate() call (mirrors getUsageWorker()'s self-heal
		// path in proxy.ts, which calls forceTerminate() on an instance for which
		// isShuttingDown() is already true).
		await Bun.sleep(5);
		const startedAt = Date.now();
		controller.forceTerminate();

		await expect(gracefulShutdown).rejects.toThrow(
			"Usage worker was force terminated",
		);
		const elapsedMs = Date.now() - startedAt;

		// Must settle promptly (driven by forceTerminate unblocking the wait), not by
		// idling out the full readyTimeoutMs.
		expect(elapsedMs).toBeLessThan(readyTimeoutMs / 2);
	});

	it("does not let a standalone forceTerminate() poison a later, unrelated terminateGracefully() call on the same instance", async () => {
		const workers: FakeWorker[] = [];
		const logger = new TestLogger();
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 0,
			logger,
		});
		controllers.push(controller);

		// Force-terminate with nothing racing it -- this used to leave a stale
		// earlyTerminationError sitting on the instance.
		controller.forceTerminate();

		// A later, wholly independent terminateGracefully() call must resolve
		// normally (there is no worker left and nothing queued), not reject with the
		// stale "Usage worker was force terminated" error from the earlier call.
		await expect(controller.terminateGracefully()).resolves.toBeUndefined();
	});

	it("rejects graceful shutdown when the worker never confirms completion", async () => {
		const workers: FakeWorker[] = [];
		const controller = new UsageWorkerController({
			createWorker() {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			readyTimeoutMs: 10_000,
			ackTimeoutMs: 10_000,
			shutdownDelayMs: 15,
			logger: new TestLogger(),
		});
		controllers.push(controller);

		workers[0]?.emitMessage({ type: "ready" });

		await expect(controller.terminateGracefully()).rejects.toThrow(
			"Usage worker did not confirm shutdown before the timeout elapsed",
		);
		expect(workers[0]?.terminateCalls).toBe(1);
		expect(controller.getHealthSnapshot().lastError).toBe(
			"Usage worker did not confirm shutdown before the timeout elapsed",
		);
	});
});
