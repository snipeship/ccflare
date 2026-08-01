import { requestEvents, ServiceUnavailableError } from "@ccflare/core";
import { Logger } from "@ccflare/logger";
import { isRequestSummary } from "@ccflare/types";
import {
	createRequestMetadata,
	ERROR_MESSAGES,
	type ProxyContext,
	prepareRequestBody,
	proxyUnauthenticated,
	proxyWithAccount,
	resolveProxyContext,
	selectAccountsForRequest,
	TIMING,
} from "./handlers";
import {
	UsageWorkerController,
	type UsageWorkerHealthSnapshot,
	type UsageWorkerTransport,
} from "./usage-worker";

export type { ProxyContext } from "./handlers";

const log = new Logger("Proxy");

let usageWorkerInstance: UsageWorkerController | null = null;

/**
 * Gets or creates the usage worker instance
 * @returns The usage worker instance
 */
export function getUsageWorker(): UsageWorkerTransport {
	if (usageWorkerInstance?.isShuttingDown()) {
		usageWorkerInstance.forceTerminate();
		usageWorkerInstance = null;
	}

	if (!usageWorkerInstance) {
		usageWorkerInstance = new UsageWorkerController({
			logger: log,
			shutdownDelayMs: TIMING.WORKER_SHUTDOWN_DELAY,
			onWorkerMessage: (data) => {
				if (data.type === "summary" && isRequestSummary(data.summary)) {
					requestEvents.emit("event", {
						type: "summary",
						payload: data.summary,
					});
				}
			},
		});
	}
	return usageWorkerInstance;
}

export function getUsageWorkerHealth(): UsageWorkerHealthSnapshot {
	return (
		usageWorkerInstance?.getHealthSnapshot() ?? {
			state: "stopped",
			queuedMessages: 0,
			pendingAcks: 0,
			lastError: null,
		}
	);
}

/**
 * Gracefully terminates the usage worker
 */
export async function terminateUsageWorker(): Promise<void> {
	if (usageWorkerInstance) {
		const activeWorker = usageWorkerInstance;
		try {
			await usageWorkerInstance.terminateGracefully();
		} finally {
			if (usageWorkerInstance === activeWorker) {
				usageWorkerInstance = null;
			}
		}
	}
}

/**
 * Main proxy handler - orchestrates the entire proxy flow
 *
 * This function coordinates the proxy process by:
 * 1. Creating request metadata for tracking
 * 2. Preparing the request body for reuse
 * 3. Selecting accounts based on load balancing strategy
 * 4. Attempting to proxy with each account in order
 * 5. Falling back to unauthenticated proxy if no accounts available
 *
 * @param req - The incoming request
 * @param url - The parsed URL
 * @param ctx - The proxy context containing strategy, database, and provider
 * @returns Promise resolving to the proxied response
 * @throws {ServiceUnavailableError} If all accounts fail to proxy the request
 * @throws {ProviderError} If unauthenticated proxy fails
 */
export async function handleProxy(
	req: Request,
	url: URL,
	ctx: ProxyContext,
): Promise<Response> {
	const requestContext = resolveProxyContext(url, ctx);
	if (!requestContext) {
		return new Response("Not Found", { status: 404 });
	}

	// 1. Create request metadata before any buffering work so total timing
	// includes proxy-side request preparation overhead.
	const requestMeta = createRequestMetadata(req, url);
	requestEvents.emit("event", {
		type: "ingress",
		id: requestMeta.id,
		timestamp: requestMeta.timestamp,
		method: requestMeta.method,
		path: requestMeta.path,
	});

	// 2. Prepare request body
	const { buffer: requestBodyBuffer } = await prepareRequestBody(req);

	// 3. Select accounts
	const accounts = selectAccountsForRequest(requestMeta, requestContext);

	// 4. Handle no accounts case
	if (accounts.length === 0) {
		return proxyUnauthenticated(
			req,
			url,
			requestMeta,
			requestBodyBuffer,
			() => {
				if (!requestBodyBuffer) return undefined;
				return new Response(requestBodyBuffer).body ?? undefined;
			},
			requestContext,
		);
	}

	// 5. Log selected accounts
	log.info(
		`Selected ${accounts.length} accounts: ${accounts.map((a) => a.name).join(", ")}`,
	);
	log.info(`Request: ${req.method} ${url.pathname}`);

	// 6. Try each account
	for (let i = 0; i < accounts.length; i++) {
		const response = await proxyWithAccount(
			req,
			url,
			accounts[i],
			requestMeta,
			requestBodyBuffer,
			() => {
				if (!requestBodyBuffer) return undefined;
				return new Response(requestBodyBuffer).body ?? undefined;
			},
			i,
			requestContext,
		);

		if (response) {
			return response;
		}
	}

	// 7. All accounts failed
	throw new ServiceUnavailableError(
		`${ERROR_MESSAGES.ALL_ACCOUNTS_FAILED} (${accounts.length} attempted)`,
		requestContext.providerName,
	);
}
