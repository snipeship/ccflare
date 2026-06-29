import { requestEvents } from "@ccflare/core";
import {
	sanitizeRequestHeaders,
	withSanitizedProxyHeaders,
} from "@ccflare/http";
import type { Account, HttpMethod } from "@ccflare/types";
import { trackProxyBackgroundTask } from "./background-tasks";
import type { ResolvedProxyContext } from "./handlers";
import { teeStream } from "./stream-tee";
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
	method: HttpMethod;
	path: string;
	account: Account | null;
	requestHeaders: Headers;
	requestBody: ArrayBuffer | null;
	response: Response;
	timestamp: number;
	upstreamRequestStartedAt?: number;
	responseHeadersReceivedAt?: number;
	retryAttempt: number;
	failoverAttempts: number;
	preExtractedModel?: string;
}

/**
 * Unified response handler that immediately streams responses
 * while forwarding data to worker for async processing.
 */
export async function forwardToClient(
	options: ResponseHandlerOptions,
	ctx: ResolvedProxyContext,
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
		upstreamRequestStartedAt,
		responseHeadersReceivedAt,
		retryAttempt, // Always 0 in new flow, but kept for message compatibility
		failoverAttempts,
		preExtractedModel,
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
		upstreamPath: ctx.upstreamPath,
		timestamp,
		upstreamRequestStartedAt,
		responseHeadersReceivedAt,
		requestHeaders: requestHeadersObj,
		requestBody: requestBody
			? Buffer.from(requestBody).toString("base64")
			: null,
		responseStatus: response.status,
		responseHeaders: responseHeadersObj,
		isStream,
		providerName: ctx.providerName,
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
	});

	/*********************************************************************
	 *  STREAMING RESPONSES — forward chunks while tracking analytics inline
	 *********************************************************************/
	if (isStream && response.body) {
		let streamEnded = false;
		const sendEnd = (success: boolean, error?: string) => {
			if (streamEnded) return;
			streamEnded = true;
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				preExtractedModel,
				success,
				...(error ? { error } : {}),
			};
			ctx.usageWorker.postMessage(endMsg);
		};

		const trackedBody = teeStream(response.body, {
			maxBytes: 0,
			onChunk(value) {
				const chunkMsg: ChunkMessage = {
					type: "chunk",
					requestId,
					data: value,
				};
				ctx.usageWorker.postMessage(chunkMsg);
			},
			onClose() {
				sendEnd(isExpectedResponse(path, response));
			},
			onError(err) {
				sendEnd(false, err.message);
			},
			onCancel(reason) {
				const message =
					reason instanceof Error
						? reason.message
						: `Stream cancelled${reason ? `: ${String(reason)}` : ""}`;
				sendEnd(false, message);
			},
		});

		return new Response(trackedBody, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}

	/*********************************************************************
	 *  NON-STREAMING RESPONSES — read body in background, send END once
	 *********************************************************************/
	const backgroundTask = (async () => {
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
				preExtractedModel,
				success: isExpectedResponse(path, clone),
			};
			ctx.usageWorker.postMessage(endMsg);
		} catch (err) {
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				preExtractedModel,
				success: false,
				error: (err as Error).message,
			};
			ctx.usageWorker.postMessage(endMsg);
		}
	})();
	trackProxyBackgroundTask(backgroundTask);

	// Return the sanitized response
	return response;
}
