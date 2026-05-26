import { describe, expect, it } from "bun:test";
import {
	HTTP_METHODS,
	isHttpMethod,
	isRequestPayload,
	isRequestSummary,
	parseRequestPayload,
	toRequestSummary,
} from "./request";

describe("request types", () => {
	it("exports the supported HTTP methods", () => {
		expect(HTTP_METHODS).toEqual([
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"OPTIONS",
			"HEAD",
			"WS",
		]);
		expect(isHttpMethod("POST")).toBe(true);
		expect(isHttpMethod("WS")).toBe(true);
		expect(isHttpMethod("TRACE")).toBe(false);
	});

	it("keeps request summaries keyed by account id while allowing separate account names", () => {
		expect(
			toRequestSummary({
				id: "request-2",
				timestamp: 456,
				method: "POST",
				path: "/v1/anthropic/v1/messages",
				provider: "anthropic",
				upstreamPath: "/v1/messages",
				accountUsed: "account-2",
				statusCode: 200,
				success: true,
				errorMessage: null,
				responseTimeMs: 123,
				failoverAttempts: 0,
				retryAttempt: 0,
				model: null,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				costUsd: null,
				inputTokens: null,
				cacheReadInputTokens: null,
				cacheCreationInputTokens: null,
				outputTokens: null,
				reasoningTokens: null,
				tokensPerSecond: null,
				ttftMs: null,
				proxyOverheadMs: null,
				upstreamTtfbMs: null,
				streamingDurationMs: null,
				responseId: null,
				previousResponseId: null,
				responseChainId: null,
				clientSessionId: null,
			}),
		).toEqual({
			id: "request-2",
			timestamp: new Date(456).toISOString(),
			method: "POST",
			path: "/v1/anthropic/v1/messages",
			provider: "anthropic",
			upstreamPath: "/v1/messages",
			accountUsed: "account-2",
			accountName: null,
			statusCode: 200,
			success: true,
			errorMessage: null,
			responseTimeMs: 123,
			failoverAttempts: 0,
			retryAttempt: 0,
			model: null,
			promptTokens: null,
			completionTokens: null,
			totalTokens: null,
			inputTokens: null,
			cacheReadInputTokens: null,
			cacheCreationInputTokens: null,
			outputTokens: null,
			reasoningTokens: null,
			costUsd: null,
			tokensPerSecond: null,
			ttftMs: null,
			proxyOverheadMs: null,
			upstreamTtfbMs: null,
			streamingDurationMs: null,
			responseId: null,
			previousResponseId: null,
			responseChainId: null,
			clientSessionId: null,
		});
	});

	it("serializes missing request metadata fields as null instead of omitting them", () => {
		expect(
			toRequestSummary({
				id: "request-null-metadata",
				timestamp: 999,
				method: "POST",
				path: "/v1/openai/responses",
				provider: "openai",
				upstreamPath: "/responses",
				accountUsed: null,
				statusCode: null,
				success: null,
				errorMessage: null,
				responseTimeMs: null,
				failoverAttempts: 0,
				retryAttempt: 0,
				model: null,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				costUsd: null,
				inputTokens: null,
				cacheReadInputTokens: null,
				cacheCreationInputTokens: null,
				outputTokens: null,
				reasoningTokens: null,
				tokensPerSecond: null,
				ttftMs: null,
				proxyOverheadMs: null,
				upstreamTtfbMs: null,
				streamingDurationMs: null,
				responseId: null,
				previousResponseId: null,
				responseChainId: null,
				clientSessionId: null,
			} as never),
		).toEqual({
			id: "request-null-metadata",
			timestamp: new Date(999).toISOString(),
			method: "POST",
			path: "/v1/openai/responses",
			provider: "openai",
			upstreamPath: "/responses",
			accountUsed: null,
			accountName: null,
			statusCode: null,
			success: null,
			errorMessage: null,
			responseTimeMs: null,
			failoverAttempts: 0,
			retryAttempt: 0,
			model: null,
			promptTokens: null,
			completionTokens: null,
			totalTokens: null,
			inputTokens: null,
			cacheReadInputTokens: null,
			cacheCreationInputTokens: null,
			outputTokens: null,
			reasoningTokens: null,
			costUsd: null,
			tokensPerSecond: null,
			ttftMs: null,
			proxyOverheadMs: null,
			upstreamTtfbMs: null,
			streamingDurationMs: null,
			responseId: null,
			previousResponseId: null,
			responseChainId: null,
			clientSessionId: null,
		});
	});

	it("allows pending request summaries with a null success state", () => {
		expect(
			isRequestSummary({
				id: "request-pending",
				timestamp: new Date(789).toISOString(),
				method: "POST",
				path: "/v1/openai/responses",
				provider: "openai",
				upstreamPath: "/responses",
				accountUsed: null,
				accountName: null,
				statusCode: 200,
				success: null,
				errorMessage: null,
				responseTimeMs: null,
				failoverAttempts: 0,
				retryAttempt: 0,
				model: null,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				inputTokens: null,
				cacheReadInputTokens: null,
				cacheCreationInputTokens: null,
				outputTokens: null,
				reasoningTokens: null,
				costUsd: null,
				tokensPerSecond: null,
				ttftMs: null,
				proxyOverheadMs: null,
				upstreamTtfbMs: null,
				streamingDurationMs: null,
				responseId: null,
				previousResponseId: null,
				responseChainId: null,
				clientSessionId: null,
			}),
		).toBe(true);
	});

	it("validates request payload metadata with trace, account, and transport sections", () => {
		expect(
			isRequestPayload({
				id: "payload-1",
				request: {
					headers: { "content-type": "application/json" },
					body: null,
				},
				response: {
					status: 200,
					headers: {},
					body: null,
				},
				meta: {
					trace: {
						timestamp: 123,
						method: "POST",
						path: "/v1/openai/responses",
						provider: "openai",
						upstreamPath: "/responses",
						responseId: "resp-1",
						previousResponseId: null,
						responseChainId: "resp-1",
						clientSessionId: "session-1",
					},
					account: {
						id: "account-1",
						name: "openai-main",
					},
					transport: {
						success: true,
						pending: false,
						retry: 0,
						rateLimited: false,
						accountsAttempted: 1,
						ttftMs: 125,
						proxyOverheadMs: 5,
						upstreamTtfbMs: 80,
						streamingDurationMs: 420,
						tokenCurve: [
							{
								chunkIndex: 10,
								tokenDelta: 4,
								timestamp: 1_234,
							},
						],
					},
				},
			}),
		).toBe(true);
	});

	it("rejects non-canonical request payloads", () => {
		expect(
			parseRequestPayload({
				request: {
					headers: { authorization: "Bearer token" },
					body: "encoded-body",
				},
				response: {
					status: 101,
					headers: { upgrade: "websocket" },
					body: "encoded-response",
				},
				meta: {
					trace: {
						timestamp: 789,
						method: "WS",
						path: "/v1/codex/responses",
						provider: "codex",
						upstreamPath: "/responses",
					},
					account: {
						id: "account-1",
					},
					transport: {
						success: true,
						isStream: true,
						retry: 0,
					},
				},
			}),
		).toBeNull();
	});
});
