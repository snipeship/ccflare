import type { AccountProvider, HttpMethod, Request } from "@ccflare/types";

export type RequestWithAccountName = Request & {
	accountName: string | null;
};

export interface RequestRow {
	id: string;
	timestamp: number;
	method: HttpMethod;
	path: string;
	provider: AccountProvider;
	upstream_path: string;
	account_used: string | null;
	status_code: number | null;
	success: 0 | 1 | null;
	error_message: string | null;
	response_time_ms: number | null;
	failover_attempts: number;
	retry_attempt: number;
	model: string | null;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	total_tokens: number | null;
	cost_usd: number | null;
	input_tokens: number | null;
	cache_read_input_tokens: number | null;
	cache_creation_input_tokens: number | null;
	output_tokens: number | null;
	reasoning_tokens: number | null;
	output_tokens_per_second: number | null;
	ttft_ms: number | null;
	proxy_overhead_ms: number | null;
	upstream_ttfb_ms: number | null;
	streaming_duration_ms: number | null;
	response_id: string | null;
	previous_response_id: string | null;
	response_chain_id: string | null;
	client_session_id: string | null;
}

export function toRequest(row: RequestRow): Request {
	return {
		id: row.id,
		timestamp: row.timestamp,
		method: row.method,
		path: row.path,
		provider: row.provider,
		upstreamPath: row.upstream_path,
		accountUsed: row.account_used,
		statusCode: row.status_code,
		success: row.success === null ? null : row.success === 1,
		errorMessage: row.error_message,
		responseTimeMs: row.response_time_ms,
		failoverAttempts: row.failover_attempts,
		retryAttempt: row.retry_attempt,
		model: row.model ?? null,
		promptTokens: row.prompt_tokens ?? null,
		completionTokens: row.completion_tokens ?? null,
		totalTokens: row.total_tokens ?? null,
		costUsd: row.cost_usd ?? null,
		inputTokens: row.input_tokens ?? null,
		cacheReadInputTokens: row.cache_read_input_tokens ?? null,
		cacheCreationInputTokens: row.cache_creation_input_tokens ?? null,
		outputTokens: row.output_tokens ?? null,
		reasoningTokens: row.reasoning_tokens ?? null,
		tokensPerSecond: row.output_tokens_per_second ?? null,
		ttftMs: row.ttft_ms ?? null,
		proxyOverheadMs: row.proxy_overhead_ms ?? null,
		upstreamTtfbMs: row.upstream_ttfb_ms ?? null,
		streamingDurationMs: row.streaming_duration_ms ?? null,
		responseId: row.response_id ?? null,
		previousResponseId: row.previous_response_id ?? null,
		responseChainId: row.response_chain_id ?? null,
		clientSessionId: row.client_session_id ?? null,
	};
}

export function toRequestWithAccountName(
	row: RequestRow & { account_name: string | null },
): RequestWithAccountName {
	return {
		...toRequest(row),
		accountName: row.account_name ?? null,
	};
}
