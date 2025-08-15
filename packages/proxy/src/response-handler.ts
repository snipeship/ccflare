import { requestEvents } from "@ccflare/core";
import {
	sanitizeRequestHeaders,
	withSanitizedProxyHeaders,
} from "@ccflare/http-common";
import type { Account } from "@ccflare/types";
import type { ProxyContext } from "./handlers";
import type { ChunkMessage, EndMessage, StartMessage } from "./worker-messages";

/**
 * Check if a response should be considered successful/expected
 * Treats certain well-known paths that return 404 as expected
 */
function isExpectedResponse(path: string, response: Response): boolean {
	// Any .well-known path returning 404 is expected
	if (path.startsWith("/.well-known/") && response.status === 404) {
		return true;
	}

	// Otherwise use standard HTTP success logic
	return response.ok;
}

export interface ResponseHandlerOptions {
	requestId: string;
	method: string;
	path: string;
	account: Account | null;
	requestHeaders: Headers;
	requestBody: ArrayBuffer | null;
	response: Response;
	timestamp: number;
	retryAttempt: number;
	failoverAttempts: number;
	agentUsed?: string | null;
	clientIp?: string | null;
}

/**
 * Unified response handler that immediately streams responses
 * while forwarding data to worker for async processing
 */
// Forward response to client while streaming analytics to worker
export async function forwardToClient(
	options: ResponseHandlerOptions,
	ctx: ProxyContext,
): Promise<Response> {
	const {
		requestId,
		method,
		path,
		account,
		requestHeaders,
		requestBody,
		response: responseRaw,
		timestamp,
		retryAttempt, // Always 0 in new flow, but kept for message compatibility
		failoverAttempts,
		agentUsed,
		clientIp,
	} = options;

	// Always strip compression headers *before* we do anything else
	const response = withSanitizedProxyHeaders(responseRaw);

	// Prepare objects once for serialisation - sanitize headers before storing
	const sanitizedReq = sanitizeRequestHeaders(requestHeaders);
	const requestHeadersObj = Object.fromEntries(sanitizedReq.entries());

	const responseHeadersObj = Object.fromEntries(response.headers.entries());

	const isStream = ctx.provider.isStreamingResponse?.(response) ?? false;

	// Send START message immediately
	const startMessage: StartMessage = {
		type: "start",
		requestId,
		accountId: account?.id || null,
		method,
		path,
		timestamp,
		requestHeaders: requestHeadersObj,
		requestBody: requestBody
			? Buffer.from(requestBody).toString("base64")
			: null,
		responseStatus: response.status,
		responseHeaders: responseHeadersObj,
		isStream,
		providerName: ctx.provider.name,
		agentUsed: agentUsed || null,
		clientIp: clientIp || null,
		retryAttempt,
		failoverAttempts,
	};
	ctx.usageWorker.postMessage(startMessage);

	// Emit request start event for real-time dashboard
	requestEvents.emit("event", {
		type: "start",
		id: requestId,
		timestamp,
		method,
		path,
		accountId: account?.id || null,
		statusCode: response.status,
		agentUsed: agentUsed || null,
	});

	/*********************************************************************
	 *  STREAMING RESPONSES — tee with Response.clone() and send chunks
	 *********************************************************************/
	if (isStream && response.body) {
		// Clone response once for background consumption.
		const analyticsClone = response.clone();

		(async () => {
			try {
				const reader = analyticsClone.body?.getReader();
				if (!reader) return; // Safety check
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value) {
						const chunkMsg: ChunkMessage = {
							type: "chunk",
							requestId,
							data: value,
						};
						ctx.usageWorker.postMessage(chunkMsg);
					}
				}
				// Finished without errors
				const endMsg: EndMessage = {
					type: "end",
					requestId,
					success: isExpectedResponse(path, analyticsClone),
				};
				ctx.usageWorker.postMessage(endMsg);
			} catch (err) {
				const endMsg: EndMessage = {
					type: "end",
					requestId,
					success: false,
					error: (err as Error).message,
				};
				ctx.usageWorker.postMessage(endMsg);
			}
		})();

		// Return the sanitized response
		return response;
	}

	/*********************************************************************
	 *  NON-STREAMING RESPONSES — read body in background, send END once
	 *********************************************************************/
	(async () => {
		try {
			const clone = response.clone();
			const bodyBuf = await clone.arrayBuffer();
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				responseBody:
					bodyBuf.byteLength > 0
						? Buffer.from(bodyBuf).toString("base64")
						: null,
				success: isExpectedResponse(path, clone),
			};
			ctx.usageWorker.postMessage(endMsg);
		} catch (err) {
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				success: false,
				error: (err as Error).message,
			};
			ctx.usageWorker.postMessage(endMsg);
		}
	})();

	// Return the sanitized response
	return response;
}
