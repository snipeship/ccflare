import { describe, expect, it } from "bun:test";
import type { Account } from "@ccflare/types";
import { waitForProxyBackgroundTasks } from "./background-tasks";
import type { ResolvedProxyContext } from "./handlers";
import { forwardToClient } from "./response-handler";

function createResolvedProxyContext(
	messages: unknown[],
	options: { isStreaming?: boolean } = {},
): ResolvedProxyContext {
	return {
		provider: {
			name: "openai",
			defaultBaseUrl: "https://api.openai.com",
			buildUrl() {
				return "https://api.openai.com/v1/responses";
			},
			prepareHeaders(headers: Headers) {
				return headers;
			},
			parseRateLimit() {
				return {
					isRateLimited: false,
					statusHeader: "allowed",
				};
			},
			extractUsage() {
				return null;
			},
			isStreamingResponse() {
				return options.isStreaming === true;
			},
		},
		providerName: "openai",
		upstreamPath: "/responses",
		strategy: {
			select(accounts: Account[]) {
				return accounts;
			},
		},
		dbOps: {
			getAvailableAccountsByProvider() {
				return [];
			},
			updateAccountRateLimitMeta() {},
			markAccountRateLimited() {},
		},
		runtime: {
			clientId: "test-client",
			retry: { attempts: 1, delayMs: 0, backoff: 1 },
			sessionDurationMs: 0,
			port: 8080,
		},
		refreshInFlight: new Map(),
		asyncWriter: {
			enqueue() {},
		},
		usageWorker: {
			postMessage(message: unknown) {
				messages.push(message);
			},
		},
	} as unknown as ResolvedProxyContext;
}

describe("forwardToClient", () => {
	it("passes explicit pre-extracted models through to the worker end message", async () => {
		const messages: unknown[] = [];
		const response = await forwardToClient(
			{
				requestId: "req-1",
				method: "POST",
				path: "/v1/ccflare/openai/responses",
				account: null,
				requestHeaders: new Headers({ "content-type": "application/json" }),
				requestBody: new TextEncoder().encode(
					JSON.stringify({ model: "anthropic/claude-sonnet-4" }),
				).buffer,
				response: new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
				timestamp: Date.now(),
				retryAttempt: 0,
				failoverAttempts: 0,
				preExtractedModel: "claude-sonnet-4",
			},
			createResolvedProxyContext(messages),
		);

		expect(response.status).toBe(200);
		await waitForProxyBackgroundTasks();

		const endMessage = messages.find(
			(message) =>
				typeof message === "object" &&
				message !== null &&
				"type" in message &&
				message.type === "end",
		) as { preExtractedModel?: string } | undefined;

		expect(endMessage?.preExtractedModel).toBe("claude-sonnet-4");
	});

	it("tracks streaming chunks on the client response body without cloning", async () => {
		const messages: unknown[] = [];
		const encoder = new TextEncoder();
		const upstreamBody = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode("data: one\n\n"));
				controller.enqueue(encoder.encode("data: two\n\n"));
				controller.close();
			},
		});

		const response = await forwardToClient(
			{
				requestId: "req-stream",
				method: "POST",
				path: "/v1/anthropic/messages",
				account: null,
				requestHeaders: new Headers({ "content-type": "application/json" }),
				requestBody: null,
				response: new Response(upstreamBody, {
					status: 200,
					headers: { "content-type": "text/event-stream; charset=utf-8" },
				}),
				timestamp: Date.now(),
				retryAttempt: 0,
				failoverAttempts: 0,
				preExtractedModel: "claude-sonnet-4",
			},
			createResolvedProxyContext(messages, { isStreaming: true }),
		);

		await expect(response.text()).resolves.toBe("data: one\n\ndata: two\n\n");

		const chunkMessages = messages.filter(
			(message) =>
				typeof message === "object" &&
				message !== null &&
				"type" in message &&
				message.type === "chunk",
		);
		const endMessage = messages.find(
			(message) =>
				typeof message === "object" &&
				message !== null &&
				"type" in message &&
				message.type === "end",
		) as { success?: boolean; preExtractedModel?: string } | undefined;

		expect(chunkMessages).toHaveLength(2);
		expect(endMessage?.success).toBe(true);
		expect(endMessage?.preExtractedModel).toBe("claude-sonnet-4");
	});
});
