// Database row type
export interface RequestRow {
	id: string;
	timestamp: number;
	method: string;
	path: string;
	account_used: string | null;
	status_code: number | null;
	success: 0 | 1;
	error_message: string | null;
	response_time_ms: number | null;
	failover_attempts: number;
	model: string | null;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	total_tokens: number | null;
	cost_usd: number | null;
	input_tokens: number | null;
	cache_read_input_tokens: number | null;
	cache_creation_input_tokens: number | null;
	output_tokens: number | null;
	agent_used: string | null;
	output_tokens_per_second: number | null;
	client_ip: string | null;
}

// Domain model
export interface Request {
	id: string;
	timestamp: number;
	method: string;
	path: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean;
	errorMessage: string | null;
	responseTimeMs: number | null;
	failoverAttempts: number;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	costUsd?: number;
	inputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	outputTokens?: number;
	agentUsed?: string;
	tokensPerSecond?: number;
	clientIp?: string;
}

// API response type
export interface RequestResponse {
	id: string;
	timestamp: string;
	method: string;
	path: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean;
	errorMessage: string | null;
	responseTimeMs: number | null;
	failoverAttempts: number;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	inputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
	agentUsed?: string;
	tokensPerSecond?: number;
	clientIp?: string;
}

// Detailed request with payload
export interface RequestPayload {
	id: string;
	request: {
		headers: Record<string, string>;
		body: string | null;
	};
	response: {
		status: number;
		headers: Record<string, string>;
		body: string | null;
	} | null;
	error?: string;
	meta: {
		accountId?: string;
		accountName?: string;
		retry?: number;
		timestamp: number;
		success?: boolean;
		rateLimited?: boolean;
		accountsAttempted?: number;
		pending?: boolean;
		path?: string;
		method?: string;
		agentUsed?: string;
	};
}

// Type mappers
export function toRequest(row: RequestRow): Request {
	return {
		id: row.id,
		timestamp: row.timestamp,
		method: row.method,
		path: row.path,
		accountUsed: row.account_used,
		statusCode: row.status_code,
		success: row.success === 1,
		errorMessage: row.error_message,
		responseTimeMs: row.response_time_ms,
		failoverAttempts: row.failover_attempts,
		model: row.model || undefined,
		promptTokens: row.prompt_tokens || undefined,
		completionTokens: row.completion_tokens || undefined,
		totalTokens: row.total_tokens || undefined,
		costUsd: row.cost_usd || undefined,
		inputTokens: row.input_tokens || undefined,
		cacheReadInputTokens: row.cache_read_input_tokens || undefined,
		cacheCreationInputTokens: row.cache_creation_input_tokens || undefined,
		outputTokens: row.output_tokens || undefined,
		agentUsed: row.agent_used || undefined,
		tokensPerSecond: row.output_tokens_per_second || undefined,
		clientIp: row.client_ip || undefined,
	};
}

export function toRequestResponse(request: Request): RequestResponse {
	return {
		id: request.id,
		timestamp: new Date(request.timestamp).toISOString(),
		method: request.method,
		path: request.path,
		accountUsed: request.accountUsed,
		statusCode: request.statusCode,
		success: request.success,
		errorMessage: request.errorMessage,
		responseTimeMs: request.responseTimeMs,
		failoverAttempts: request.failoverAttempts,
		model: request.model,
		promptTokens: request.promptTokens,
		completionTokens: request.completionTokens,
		totalTokens: request.totalTokens,
		inputTokens: request.inputTokens,
		cacheReadInputTokens: request.cacheReadInputTokens,
		cacheCreationInputTokens: request.cacheCreationInputTokens,
		outputTokens: request.outputTokens,
		costUsd: request.costUsd,
		agentUsed: request.agentUsed,
		tokensPerSecond: request.tokensPerSecond,
		clientIp: request.clientIp,
	};
}

// Special account ID for requests without an account
export const NO_ACCOUNT_ID = "no_account";
