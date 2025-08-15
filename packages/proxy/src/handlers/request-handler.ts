import crypto from "node:crypto";
import { ValidationError } from "@ccflare/core";
import type { Provider } from "@ccflare/providers";
import type { RequestMeta } from "@ccflare/types";
import { ERROR_MESSAGES } from "./proxy-types";

/**
 * Extract client IP from request headers
 * @param req - The incoming request
 * @returns Client IP address or null if not available
 */
function getClientIp(req: Request): string | null {
	// Check common headers for real client IP (in order of preference)
	const headers = req.headers;

	// Check X-Forwarded-For (most common)
	const xForwardedFor = headers.get("x-forwarded-for");
	if (xForwardedFor) {
		// X-Forwarded-For can contain multiple IPs, get the first one (original client)
		return xForwardedFor.split(",")[0].trim();
	}

	// Check CF-Connecting-IP (Cloudflare)
	const cfConnectingIp = headers.get("cf-connecting-ip");
	if (cfConnectingIp) {
		return cfConnectingIp;
	}

	// Check X-Real-IP (nginx)
	const xRealIp = headers.get("x-real-ip");
	if (xRealIp) {
		return xRealIp;
	}

	// Check X-Client-IP
	const xClientIp = headers.get("x-client-ip");
	if (xClientIp) {
		return xClientIp;
	}

	// If no proxy headers, we can't determine the real IP from a Request object
	// The actual socket IP would need to be passed from the server
	return null;
}

/**
 * Creates request metadata for tracking and analytics
 * @param req - The incoming request
 * @param url - The parsed URL
 * @returns Request metadata object
 */
export function createRequestMetadata(req: Request, url: URL): RequestMeta {
	return {
		id: crypto.randomUUID(),
		method: req.method,
		path: url.pathname,
		timestamp: Date.now(),
		clientIp: getClientIp(req),
	};
}

/**
 * Validates that the provider can handle the requested path
 * @param provider - The provider instance
 * @param pathname - The request path
 * @throws {ValidationError} If provider cannot handle the path
 */
export function validateProviderPath(
	provider: Provider,
	pathname: string,
): void {
	if (!provider.canHandle(pathname)) {
		throw new ValidationError(
			`${ERROR_MESSAGES.PROVIDER_CANNOT_HANDLE}: ${pathname}`,
			"path",
			pathname,
		);
	}
}

/**
 * Prepares request body for analytics and creates body stream factory
 * @param req - The incoming request
 * @returns Object containing the buffered body and stream factory
 */
export async function prepareRequestBody(req: Request): Promise<{
	buffer: ArrayBuffer | null;
	createStream: () => ReadableStream<Uint8Array> | undefined;
}> {
	let buffer: ArrayBuffer | null = null;

	if (req.body) {
		buffer = await req.arrayBuffer();
	}

	return {
		buffer,
		createStream: () => {
			if (!buffer) return undefined;
			return new Response(buffer).body ?? undefined;
		},
	};
}

/**
 * Makes the actual HTTP request to the provider
 * @param targetUrl - The target URL to fetch
 * @param method - HTTP method
 * @param headers - Request headers
 * @param createBodyStream - Function to create request body stream
 * @param hasBody - Whether the request has a body
 * @returns Promise resolving to the response
 */
export async function makeProxyRequest(
	targetUrl: string,
	method: string,
	headers: Headers,
	createBodyStream: () => ReadableStream<Uint8Array> | undefined,
	hasBody: boolean,
): Promise<Response> {
	return fetch(targetUrl, {
		method,
		headers,
		body: createBodyStream(),
		...(hasBody ? ({ duplex: "half" } as RequestInit) : {}),
	});
}
