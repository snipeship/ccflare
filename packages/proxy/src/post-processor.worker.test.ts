import { describe, expect, it } from "bun:test";
import {
	capStoredBase64Body,
	createRequestState,
	processStreamChunk,
} from "./post-processor.worker";
import type { StartMessage } from "./worker-messages";

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
			"content-type": "text/event-stream; charset=utf-8",
		},
		isStream: true,
		providerName: "openai",
		retryAttempt: 0,
		failoverAttempts: 0,
	};
}

describe("processStreamChunk", () => {
	it("extracts usage when response.completed event and data are in the same chunk", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode(
				[
					"event: response.completed",
					'data: {"type":"response.completed","response":{"id":"resp_123","model":"gpt-4o","usage":{"input_tokens":13,"output_tokens":5,"total_tokens":18}}}',
					"",
				].join("\n"),
			),
			state,
		);

		expect(state.usage).toMatchObject({
			model: "gpt-4o",
			inputTokens: 13,
			outputTokens: 5,
			totalTokens: 18,
		});
	});

	it("extracts usage when response.completed event and data are split across chunks", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode("event: response.completed\n"),
			state,
		);
		processStreamChunk(
			new TextEncoder().encode(
				'data: {"type":"response.completed","response":{"id":"resp_123","model":"gpt-4o","usage":{"input_tokens":13,"output_tokens":5,"total_tokens":18}}}\n\n',
			),
			state,
		);

		expect(state.usage).toMatchObject({
			model: "gpt-4o",
			inputTokens: 13,
			outputTokens: 5,
			totalTokens: 18,
		});
	});

	it("adjusts cached input tokens and stores reasoning tokens from response.completed usage", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode(
				[
					"event: response.completed",
					'data: {"type":"response.completed","response":{"id":"resp_123","model":"gpt-4o","usage":{"input_tokens":18815,"output_tokens":431,"total_tokens":19246,"input_tokens_details":{"cached_tokens":18688},"output_tokens_details":{"reasoning_tokens":321}}}}',
					"",
				].join("\n"),
			),
			state,
		);

		expect(state.usage).toMatchObject({
			model: "gpt-4o",
			inputTokens: 127,
			cacheReadInputTokens: 18688,
			outputTokens: 431,
			reasoningTokens: 321,
			totalTokens: 19246,
		});
	});

	it("tracks token timing and local token counts for response.output_text.delta events", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode(
				[
					"event: response.output_text.delta",
					'data: {"type":"response.output_text.delta","delta":"Hello"}',
					"",
				].join("\n"),
			),
			state,
		);

		expect(state.firstTokenTimestamp).toBeNumber();
		expect(state.lastTokenTimestamp).toBeNumber();
		expect((state.usage.outputTokensComputed ?? 0) > 0).toBe(true);
	});

	it("normalizes compatibility-prefixed models in chat completion chunks", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode(
				[
					"event: message",
					'data: {"object":"chat.completion.chunk","model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"}}]}',
					"",
				].join("\n"),
			),
			state,
		);

		expect(state.usage.model).toBe("gpt-4o");
	});

	it("extracts usage from chat completion chunks without explicit event lines", () => {
		const state = createRequestState(createStartMessage());

		processStreamChunk(
			new TextEncoder().encode(
				[
					'data: {"object":"chat.completion.chunk","model":"gpt-5.4","choices":[{"index":0,"delta":{"content":"Hey"}}]}',
					"",
					'data: {"object":"chat.completion.chunk","model":"gpt-5.4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":68,"input_tokens":44,"output_tokens":24,"cache_read_input_tokens":0,"reasoning_tokens":0}}',
					"",
				].join("\n"),
			),
			state,
		);

		expect(state.usage).toMatchObject({
			model: "gpt-5.4",
			inputTokens: 44,
			outputTokens: 24,
			totalTokens: 68,
		});
		expect(state.firstTokenTimestamp).toBeNumber();
		expect(state.lastTokenTimestamp).toBeNumber();
	});
});

describe("capStoredBase64Body", () => {
	it("keeps bodies under the cap unchanged", () => {
		const body = Buffer.from("small body", "utf-8").toString("base64");

		expect(capStoredBase64Body(body, 64)).toBe(body);
	});

	it("replaces bodies over the cap with a small placeholder", () => {
		const body = Buffer.from("x".repeat(128), "utf-8").toString("base64");
		const capped = capStoredBase64Body(body, 64);

		expect(capped).not.toBe(body);
		expect(Buffer.from(capped ?? "", "base64").toString("utf-8")).toContain(
			"payload omitted",
		);
	});

	it("omits bodies when the cap is zero", () => {
		const body = Buffer.from("body", "utf-8").toString("base64");

		expect(capStoredBase64Body(body, 0)).toBeNull();
	});
});
