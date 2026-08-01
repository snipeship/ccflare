import { describe, expect, it } from "bun:test";
import { isLogEvent, parseLogStreamEvent } from "./logging";
import { parseRequestStreamEvent } from "./request-events";

describe("stream event validation", () => {
	it("parses validated request stream events", () => {
		expect(
			parseRequestStreamEvent({
				type: "ingress",
				id: "request-0",
				timestamp: 122,
				method: "POST",
				path: "/v1/claude-code/v1/messages",
			}),
		).toEqual({
			type: "ingress",
			id: "request-0",
			timestamp: 122,
			method: "POST",
			path: "/v1/claude-code/v1/messages",
		});

		expect(
			parseRequestStreamEvent({
				type: "start",
				id: "request-1",
				timestamp: 123,
				method: "WS",
				path: "/v1/openai/realtime",
				accountId: null,
				statusCode: 101,
			}),
		).toEqual({
			type: "start",
			id: "request-1",
			timestamp: 123,
			method: "WS",
			path: "/v1/openai/realtime",
			accountId: null,
			statusCode: 101,
		});

		expect(
			parseRequestStreamEvent({
				type: "start",
				id: "request-2",
				timestamp: 123,
				method: "TRACE",
				path: "/v1/openai/realtime",
				accountId: null,
				statusCode: 101,
			}),
		).toBeNull();

		expect(
			parseRequestStreamEvent({
				type: "ingress",
				id: "request-invalid",
				timestamp: 123,
				method: "TRACE",
				path: "/v1/openai/realtime",
			}),
		).toBeNull();

		expect(
			parseRequestStreamEvent({
				type: "summary",
				payload: {
					id: "request-summary",
					timestamp: new Date(456).toISOString(),
					method: "POST",
					path: "/v1/openai/responses",
					provider: "openai",
					upstreamPath: "/responses",
					accountUsed: null,
					accountName: null,
					statusCode: 200,
					success: true,
					errorMessage: null,
					responseTimeMs: 123,
					failoverAttempts: 0,
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
				},
			}),
		).toEqual({
			type: "summary",
			payload: {
				id: "request-summary",
				timestamp: new Date(456).toISOString(),
				method: "POST",
				path: "/v1/openai/responses",
				provider: "openai",
				upstreamPath: "/responses",
				accountUsed: null,
				accountName: null,
				statusCode: 200,
				success: true,
				errorMessage: null,
				responseTimeMs: 123,
				failoverAttempts: 0,
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
			},
		});
	});

	it("rejects full-payload request events", () => {
		expect(
			parseRequestStreamEvent({
				type: "payload",
				payload: {
					id: "request-payload",
					request: { headers: {}, body: "large-body" },
					response: null,
					meta: {
						trace: { timestamp: 123 },
						account: { id: null },
						transport: {},
					},
				},
			}),
		).toBeNull();
	});

	it("parses validated log stream payloads", () => {
		expect(parseLogStreamEvent({ connected: true })).toEqual({
			connected: true,
		});
		expect(
			parseLogStreamEvent({
				ts: Date.now(),
				level: "INFO",
				msg: "ready",
			}),
		).toEqual({
			ts: expect.any(Number),
			level: "INFO",
			msg: "ready",
		});
		expect(isLogEvent({ ts: 1, level: "WARN", msg: "ok" })).toBe(true);
		expect(isLogEvent({ ts: 1, level: "TRACE", msg: "nope" })).toBe(false);
	});
});
