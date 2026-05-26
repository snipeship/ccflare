import { isFiniteNumber, isRecord } from "./guards";
import { type AccountProvider, isAccountProvider } from "./provider-metadata";

function isOptionalNullableNumber(
	value: unknown,
): value is number | null | undefined {
	return value === undefined || value === null || isFiniteNumber(value);
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || isFiniteNumber(value);
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isOptionalNullableString(
	value: unknown,
): value is string | null | undefined {
	return value === undefined || value === null || typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

function isNullableBoolean(value: unknown): value is boolean | null {
	return value === null || typeof value === "boolean";
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		isRecord(value) &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
}

export interface TokenCurveSample {
	chunkIndex: number;
	tokenDelta: number;
	timestamp: number;
}

function isTokenCurveSampleArray(
	value: unknown,
): value is Array<TokenCurveSample> {
	return (
		Array.isArray(value) &&
		value.every(
			(sample) =>
				isRecord(sample) &&
				isFiniteNumber(sample.chunkIndex) &&
				isFiniteNumber(sample.tokenDelta) &&
				isFiniteNumber(sample.timestamp),
		)
	);
}

export const HTTP_METHODS = Object.freeze([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
	"WS",
]) as readonly [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
	"WS",
];

export type HttpMethod = (typeof HTTP_METHODS)[number];

export function isHttpMethod(value: string): value is HttpMethod {
	return HTTP_METHODS.includes(value as HttpMethod);
}

// Domain model
export interface Request {
	id: string;
	timestamp: number;
	method: HttpMethod;
	path: string;
	provider: AccountProvider;
	upstreamPath: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean | null;
	errorMessage: string | null;
	responseTimeMs: number | null;
	failoverAttempts: number;
	/**
	 * Same-account retry count surfaced from the `requests.retry_attempt`
	 * column. Independent of `failoverAttempts`, which counts cross-account
	 * fallbacks.
	 */
	retryAttempt: number;
	model: string | null;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	costUsd: number | null;
	inputTokens: number | null;
	cacheReadInputTokens: number | null;
	cacheCreationInputTokens: number | null;
	outputTokens: number | null;
	reasoningTokens: number | null;
	tokensPerSecond: number | null;
	ttftMs: number | null;
	proxyOverheadMs: number | null;
	upstreamTtfbMs: number | null;
	streamingDurationMs: number | null;
	responseId: string | null;
	previousResponseId: string | null;
	responseChainId: string | null;
	clientSessionId: string | null;
}

// Shared request summary transport
export interface RequestSummary {
	id: string;
	timestamp: string;
	method: HttpMethod;
	path: string;
	provider: AccountProvider;
	upstreamPath: string;
	accountUsed: string | null;
	accountName: string | null;
	statusCode: number | null;
	success: boolean | null;
	errorMessage: string | null;
	responseTimeMs: number | null;
	failoverAttempts: number;
	/**
	 * Same-account retry count surfaced from the `requests.retry_attempt`
	 * column. Independent of `failoverAttempts`, which counts cross-account
	 * fallbacks.
	 */
	retryAttempt: number;
	model: string | null;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	inputTokens: number | null;
	cacheReadInputTokens: number | null;
	cacheCreationInputTokens: number | null;
	outputTokens: number | null;
	reasoningTokens: number | null;
	costUsd: number | null;
	tokensPerSecond: number | null;
	ttftMs: number | null;
	proxyOverheadMs: number | null;
	upstreamTtfbMs: number | null;
	streamingDurationMs: number | null;
	responseId: string | null;
	previousResponseId: string | null;
	responseChainId: string | null;
	clientSessionId: string | null;
}

export interface RequestTraceMeta {
	timestamp: number;
	method?: HttpMethod;
	path?: string;
	provider?: AccountProvider;
	upstreamPath?: string;
	responseId?: string | null;
	previousResponseId?: string | null;
	responseChainId?: string | null;
	clientSessionId?: string | null;
}

export interface RequestAccountMeta {
	id: string | null;
	name?: string | null;
}

export interface RequestTransportMeta {
	success?: boolean;
	rateLimited?: boolean;
	accountsAttempted?: number;
	pending?: boolean;
	retry?: number;
	isStream?: boolean;
	ttftMs?: number | null;
	proxyOverheadMs?: number | null;
	upstreamTtfbMs?: number | null;
	streamingDurationMs?: number | null;
	tokenCurve?: Array<TokenCurveSample> | null;
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
		trace: RequestTraceMeta;
		account: RequestAccountMeta;
		transport: RequestTransportMeta;
	};
}

export function toRequestSummary(request: Request): RequestSummary {
	return {
		id: request.id,
		timestamp: new Date(request.timestamp).toISOString(),
		method: request.method,
		path: request.path,
		provider: request.provider,
		upstreamPath: request.upstreamPath,
		accountUsed: request.accountUsed,
		accountName: null,
		statusCode: request.statusCode,
		success: request.success,
		errorMessage: request.errorMessage,
		responseTimeMs: request.responseTimeMs,
		failoverAttempts: request.failoverAttempts,
		retryAttempt: request.retryAttempt,
		model: request.model ?? null,
		promptTokens: request.promptTokens ?? null,
		completionTokens: request.completionTokens ?? null,
		totalTokens: request.totalTokens ?? null,
		inputTokens: request.inputTokens ?? null,
		cacheReadInputTokens: request.cacheReadInputTokens ?? null,
		cacheCreationInputTokens: request.cacheCreationInputTokens ?? null,
		outputTokens: request.outputTokens ?? null,
		reasoningTokens: request.reasoningTokens ?? null,
		costUsd: request.costUsd ?? null,
		tokensPerSecond: request.tokensPerSecond ?? null,
		ttftMs: request.ttftMs ?? null,
		proxyOverheadMs: request.proxyOverheadMs ?? null,
		upstreamTtfbMs: request.upstreamTtfbMs ?? null,
		streamingDurationMs: request.streamingDurationMs ?? null,
		responseId: request.responseId ?? null,
		previousResponseId: request.previousResponseId ?? null,
		responseChainId: request.responseChainId ?? null,
		clientSessionId: request.clientSessionId ?? null,
	};
}

// Special account ID for requests without an account
export const NO_ACCOUNT_ID = "no_account";

export function isRequestSummary(value: unknown): value is RequestSummary {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		typeof value.timestamp === "string" &&
		typeof value.method === "string" &&
		isHttpMethod(value.method) &&
		typeof value.path === "string" &&
		typeof value.provider === "string" &&
		isAccountProvider(value.provider) &&
		typeof value.upstreamPath === "string" &&
		(value.accountUsed === null || typeof value.accountUsed === "string") &&
		(value.accountName === null || typeof value.accountName === "string") &&
		isOptionalNullableNumber(value.statusCode) &&
		isNullableBoolean(value.success) &&
		isOptionalNullableString(value.errorMessage) &&
		isOptionalNullableNumber(value.responseTimeMs) &&
		isFiniteNumber(value.failoverAttempts) &&
		isFiniteNumber(value.retryAttempt) &&
		isNullableString(value.model) &&
		isNullableNumber(value.promptTokens) &&
		isNullableNumber(value.completionTokens) &&
		isNullableNumber(value.totalTokens) &&
		isNullableNumber(value.inputTokens) &&
		isNullableNumber(value.cacheReadInputTokens) &&
		isNullableNumber(value.cacheCreationInputTokens) &&
		isNullableNumber(value.outputTokens) &&
		isNullableNumber(value.reasoningTokens) &&
		isNullableNumber(value.costUsd) &&
		isNullableNumber(value.tokensPerSecond) &&
		isNullableNumber(value.ttftMs) &&
		isNullableNumber(value.proxyOverheadMs) &&
		isNullableNumber(value.upstreamTtfbMs) &&
		isNullableNumber(value.streamingDurationMs) &&
		isNullableString(value.responseId) &&
		isNullableString(value.previousResponseId) &&
		isNullableString(value.responseChainId) &&
		isNullableString(value.clientSessionId)
	);
}

export function isRequestPayload(value: unknown): value is RequestPayload {
	if (
		!isRecord(value) ||
		!isRecord(value.request) ||
		!isRecord(value.meta) ||
		!isRecord(value.meta.trace) ||
		!isRecord(value.meta.account) ||
		!isRecord(value.meta.transport)
	) {
		return false;
	}

	const { request, response, meta } = value;
	const trace = meta.trace as Record<string, unknown>;
	const account = meta.account as Record<string, unknown>;
	const transport = meta.transport as Record<string, unknown>;

	if (
		!isStringRecord(request.headers) ||
		isOptionalNullableString(request.body) === false
	) {
		return false;
	}

	if (
		response !== null &&
		(!isRecord(response) ||
			!isFiniteNumber(response.status) ||
			!isStringRecord(response.headers) ||
			isOptionalNullableString(response.body) === false)
	) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		isOptionalString(value.error) &&
		isFiniteNumber(trace.timestamp) &&
		(trace.provider === undefined ||
			(typeof trace.provider === "string" &&
				isAccountProvider(trace.provider))) &&
		(trace.upstreamPath === undefined ||
			typeof trace.upstreamPath === "string") &&
		(trace.path === undefined || typeof trace.path === "string") &&
		(trace.method === undefined ||
			(typeof trace.method === "string" && isHttpMethod(trace.method))) &&
		isOptionalNullableString(trace.responseId) &&
		isOptionalNullableString(trace.previousResponseId) &&
		isOptionalNullableString(trace.responseChainId) &&
		isOptionalNullableString(trace.clientSessionId) &&
		(account.id === null || typeof account.id === "string") &&
		(account.name === undefined ||
			account.name === null ||
			typeof account.name === "string") &&
		(transport.success === undefined ||
			typeof transport.success === "boolean") &&
		(transport.rateLimited === undefined ||
			typeof transport.rateLimited === "boolean") &&
		(transport.accountsAttempted === undefined ||
			isFiniteNumber(transport.accountsAttempted)) &&
		(transport.pending === undefined ||
			typeof transport.pending === "boolean") &&
		(transport.retry === undefined || isFiniteNumber(transport.retry)) &&
		(transport.isStream === undefined ||
			typeof transport.isStream === "boolean") &&
		isOptionalNullableNumber(transport.ttftMs) &&
		isOptionalNullableNumber(transport.proxyOverheadMs) &&
		isOptionalNullableNumber(transport.upstreamTtfbMs) &&
		isOptionalNullableNumber(transport.streamingDurationMs) &&
		(transport.tokenCurve === undefined ||
			transport.tokenCurve === null ||
			isTokenCurveSampleArray(transport.tokenCurve))
	);
}

export function parseRequestPayload(value: unknown): RequestPayload | null {
	if (isRequestPayload(value)) {
		return value;
	}

	return null;
}
