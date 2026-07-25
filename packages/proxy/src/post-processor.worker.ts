declare var self: Worker;

import {
	BUFFER_SIZES,
	estimateCostUSD,
	formatCost,
	TIME_CONSTANTS,
} from "@ccflare/core";
import { AsyncDbWriter, DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import {
	extractClientSessionIdFromHeaders,
	extractRequestLinkageFromPayload,
	isRecord,
	type RequestPayload,
	type RequestSummary,
	type TokenCurveSample,
} from "@ccflare/types";
import { get_encoding } from "@dqbd/tiktoken";
import {
	extractTrackedModelFromRequestBody,
	normalizeTrackedModel,
} from "./compat/model-id";
import {
	normalizeOpenAIUsage,
	type OpenAIUsagePayload,
	parseOpenAIUsagePayload,
} from "./openai-usage";
import { combineChunks } from "./stream-tee";
import type {
	AckMessage,
	ChunkMessage,
	EndMessage,
	IncomingWorkerMessage,
	PayloadMessage,
	PreExtractedUsage,
	ReadyMessage,
	ShutdownCompleteMessage,
	StartMessage,
	SummaryMessage,
} from "./worker-messages";

interface RequestState {
	startMessage: StartMessage;
	/** SSE text buffer for usage extraction (bounded by MAX_BUFFER_SIZE) */
	buffer: string;
	/** Payload retention chunks (bounded by MAX_PAYLOAD_BYTES) */
	chunks: Uint8Array[];
	/** Running total of bytes stored in chunks */
	chunksBytes: number;
	/** Whether the payload cap has been reached (stops storing more chunks) */
	payloadCapped: boolean;
	currentSseEvent: string;
	usage: {
		model?: string;
		inputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		outputTokens?: number;
		reasoningTokens?: number;
		outputTokensComputed?: number;
		totalTokens?: number;
		costUsd?: number;
		tokensPerSecond?: number;
	};
	lastActivity: number;
	firstTokenTimestamp?: number;
	lastTokenTimestamp?: number;
	providerFinalOutputTokens?: number;
	shouldSkipLogging?: boolean;
	clientSessionId?: string | null;
	tokenChunkCount: number;
	tokenCurve: Array<TokenCurveSample>;
}

const log = new Logger("PostProcessor");
const requests = new Map<string, RequestState>();

// Initialize tiktoken encoder (cl100k_base is used for Claude models)
const tokenEncoder = get_encoding("cl100k_base");

// Module-level TextDecoder for streaming SSE decode (avoids per-chunk allocation)
const streamDecoder = new TextDecoder("utf-8", { fatal: false });

// Initialize database connection for worker
const dbOps = new DatabaseOperations();
const asyncWriter = new AsyncDbWriter();

// Environment variables
const MAX_BUFFER_SIZE =
	Number(
		process.env.CF_STREAM_USAGE_BUFFER_KB ||
			BUFFER_SIZES.STREAM_USAGE_BUFFER_KB,
	) * 1024;
const TIMEOUT_MS = Number(
	process.env.CF_STREAM_TIMEOUT_MS || TIME_CONSTANTS.STREAM_TIMEOUT_DEFAULT,
);
// Hard cap on payload retention bytes per request (default: 2MB)
const MAX_PAYLOAD_BYTES =
	Number(process.env.CF_MAX_PAYLOAD_BYTES || 0) || 2 * 1024 * 1024;
// Hard cap on concurrent tracked requests in the worker
const MAX_TRACKED_REQUESTS =
	Number(process.env.CF_MAX_TRACKED_REQUESTS || 0) || 100;
const TOKEN_CURVE_SAMPLE_EVERY = Math.max(
	1,
	Number(process.env.CF_TOKEN_CURVE_SAMPLE_EVERY || 10) || 10,
);
const TOKEN_CURVE_MAX_SAMPLES = Math.max(
	1,
	Number(process.env.CF_TOKEN_CURVE_MAX_SAMPLES || 200) || 200,
);
let cleanupIntervalId: Timer | null = null;
let messageProcessingQueue: Promise<void> = Promise.resolve();

// Check if a request should be logged
function shouldLogRequest(path: string, status: number): boolean {
	// Skip logging .well-known 404s
	if (path.startsWith("/.well-known/") && status === 404) {
		return false;
	}
	return true;
}

// Extract system prompt from request body
function _extractSystemPrompt(requestBody: string | null): string | null {
	if (!requestBody) return null;

	try {
		// Decode base64 request body
		const decodedBody = Buffer.from(requestBody, "base64").toString("utf-8");
		const parsed = JSON.parse(decodedBody);

		// Check if there's a system property in the request
		if (parsed.system) {
			// Handle both string and array formats
			if (typeof parsed.system === "string") {
				return parsed.system;
			} else if (Array.isArray(parsed.system)) {
				// Concatenate all text from system messages
				return parsed.system
					.filter(
						(item: { type?: string; text?: string }) =>
							item.type === "text" && item.text,
					)
					.map((item: { type?: string; text?: string }) => item.text)
					.join("\n");
			}
		}
	} catch (error) {
		log.debug("Failed to extract system prompt:", error);
	}

	return null;
}

// Parse SSE lines to extract usage (reuse existing logic)
function parseSSELine(line: string): { event?: string; data?: string } {
	if (line.startsWith("event: ")) {
		return { event: line.slice(7).trim() };
	}
	if (line.startsWith("data: ")) {
		return { data: line.slice(6).trim() };
	}
	return {};
}

// Extract usage data from non-stream JSON response bodies
function extractUsageFromJson(
	json: {
		model?: string;
		response?: {
			model?: string;
			usage?: OpenAIUsagePayload;
		};
		usage?: OpenAIUsagePayload;
	},
	state: RequestState,
): void {
	if (!json) return;

	const usageObj = json.response?.usage ?? json.usage;
	if (!usageObj) return;

	applyUsageData(
		state,
		normalizeOpenAIUsage(usageObj),
		json.response?.model ?? json.model ?? state.usage.model,
	);
}

function setUsageModel(state: RequestState, model: unknown): void {
	const normalizedModel = normalizeTrackedModel(model);
	if (normalizedModel) {
		state.usage.model = normalizedModel;
	}
}

function applyUsageData(
	state: RequestState,
	usageObj: PreExtractedUsage,
	model?: string,
): void {
	setUsageModel(state, model);
	state.usage.inputTokens =
		usageObj.prompt_tokens ?? usageObj.input_tokens ?? 0;
	state.usage.cacheReadInputTokens = usageObj.cache_read_input_tokens ?? 0;
	state.usage.cacheCreationInputTokens =
		usageObj.cache_creation_input_tokens ?? 0;
	state.usage.outputTokens =
		usageObj.completion_tokens ?? usageObj.output_tokens ?? 0;
	state.usage.reasoningTokens = usageObj.reasoning_tokens ?? 0;

	const prompt =
		(state.usage.inputTokens ?? 0) +
		(state.usage.cacheReadInputTokens ?? 0) +
		(state.usage.cacheCreationInputTokens ?? 0);
	const completion = state.usage.outputTokens ?? 0;
	state.usage.totalTokens = usageObj.total_tokens ?? prompt + completion;
}

function computeTokenCount(text: string): number | null {
	try {
		return tokenEncoder.encode(text).length;
	} catch (err) {
		log.debug("Failed to count tokens:", err);
		return null;
	}
}

function recordTokenEvent(
	state: RequestState,
	text: string,
	timestamp: number = Date.now(),
): void {
	if (!text) {
		return;
	}

	const tokenDelta = computeTokenCount(text);
	if (!tokenDelta || tokenDelta <= 0) {
		return;
	}

	if (!state.firstTokenTimestamp) {
		state.firstTokenTimestamp = timestamp;
	}
	state.lastTokenTimestamp = timestamp;

	if (state.providerFinalOutputTokens === undefined) {
		state.usage.outputTokensComputed =
			(state.usage.outputTokensComputed || 0) + tokenDelta;
	}

	state.tokenChunkCount += 1;
	if (
		state.tokenChunkCount % TOKEN_CURVE_SAMPLE_EVERY === 0 &&
		state.tokenCurve.length < TOKEN_CURVE_MAX_SAMPLES
	) {
		state.tokenCurve.push({
			chunkIndex: state.tokenChunkCount,
			tokenDelta,
			timestamp,
		});
	}
}

function durationBetween(
	start: number | undefined,
	end: number | undefined,
): number | null {
	if (start === undefined || end === undefined) {
		return null;
	}

	return Math.max(0, end - start);
}

// Cheap substring guard: only parse SSE lines that could influence
// usage, model, or timing state. Skips JSON.parse on irrelevant lines.
function isRelevantSseData(data: string): boolean {
	return (
		data.includes('"usage"') ||
		data.includes('"message_start"') ||
		data.includes('"message_delta"') ||
		data.includes('"response.created"') ||
		data.includes('"response.completed"') ||
		data.includes('"chat.completion.chunk"') ||
		data.includes('"content_block_start"') ||
		data.includes('"content_block_delta"') ||
		data.includes('"response.output_text.delta"')
	);
}

function extractUsageFromData(data: string, state: RequestState): void {
	if (!isRelevantSseData(data)) return;

	try {
		const parsed = JSON.parse(data);

		if (
			isRecord(parsed) &&
			parsed.type === "response.created" &&
			(typeof parsed.model === "string" ||
				(isRecord(parsed.response) &&
					typeof parsed.response.model === "string"))
		) {
			setUsageModel(
				state,
				(isRecord(parsed.response) && typeof parsed.response.model === "string"
					? parsed.response.model
					: undefined) ??
					(typeof parsed.model === "string" ? parsed.model : undefined),
			);
		}

		// Handle message_start
		if (
			isRecord(parsed) &&
			parsed.type === "message_start" &&
			isRecord(parsed.message) &&
			isRecord(parsed.message.usage)
		) {
			const usage = parsed.message.usage;
			state.usage.inputTokens =
				typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
			state.usage.cacheReadInputTokens =
				typeof usage.cache_read_input_tokens === "number"
					? usage.cache_read_input_tokens
					: 0;
			state.usage.cacheCreationInputTokens =
				typeof usage.cache_creation_input_tokens === "number"
					? usage.cache_creation_input_tokens
					: 0;
			state.usage.outputTokens =
				typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
			if (typeof parsed.message.model === "string") {
				setUsageModel(state, parsed.message.model);
			}
		}

		if (
			isRecord(parsed) &&
			parsed.type === "response.completed" &&
			isRecord(parsed.response)
		) {
			const usage = parseOpenAIUsagePayload(parsed.response.usage);
			applyUsageData(
				state,
				normalizeOpenAIUsage(usage),
				typeof parsed.response.model === "string"
					? parsed.response.model
					: state.usage.model,
			);
		}

		if (
			isRecord(parsed) &&
			parsed.type === "response.output_text.delta" &&
			typeof parsed.delta === "string"
		) {
			recordTokenEvent(state, parsed.delta);
		}

		if (
			isRecord(parsed) &&
			parsed.object === "chat.completion.chunk" &&
			Array.isArray(parsed.choices)
		) {
			if (typeof parsed.model === "string") {
				setUsageModel(state, parsed.model);
			}

			const firstChoice = isRecord(parsed.choices[0])
				? parsed.choices[0]
				: null;
			const delta =
				firstChoice && isRecord(firstChoice.delta) ? firstChoice.delta : null;
			if (delta) {
				if (typeof delta.content === "string") {
					recordTokenEvent(state, delta.content);
				}
				if (typeof delta.reasoning_content === "string") {
					recordTokenEvent(state, delta.reasoning_content);
				}
				if (Array.isArray(delta.tool_calls)) {
					for (const toolCall of delta.tool_calls) {
						if (!isRecord(toolCall) || !isRecord(toolCall.function)) continue;
						if (typeof toolCall.function.arguments === "string") {
							recordTokenEvent(state, toolCall.function.arguments);
						}
					}
				}
			}

			if (isRecord(parsed.usage)) {
				applyUsageData(
					state,
					normalizeOpenAIUsage(parseOpenAIUsagePayload(parsed.usage)),
					typeof parsed.model === "string" ? parsed.model : state.usage.model,
				);
			}
		}

		// Handle message_delta - provider's authoritative output token count.
		if (isRecord(parsed) && parsed.type === "message_delta") {
			if (
				isRecord(parsed.usage) &&
				typeof parsed.usage.output_tokens === "number"
			) {
				state.providerFinalOutputTokens = parsed.usage.output_tokens;
				state.usage.outputTokens = parsed.usage.output_tokens;
				if (
					parsed.usage.output_tokens > 0 &&
					state.lastTokenTimestamp === undefined
				) {
					state.lastTokenTimestamp = Date.now();
				}
				return; // No further processing needed
			}
		}

		if (
			isRecord(parsed) &&
			parsed.type === "content_block_delta" &&
			isRecord(parsed.delta)
		) {
			let textToCount: string | undefined;

			// Extract text from different delta types
			if (
				parsed.delta.type === "text_delta" &&
				typeof parsed.delta.text === "string"
			) {
				textToCount = parsed.delta.text;
			} else if (
				parsed.delta.type === "thinking_delta" &&
				typeof parsed.delta.thinking === "string"
			) {
				textToCount = parsed.delta.thinking;
			}

			if (textToCount) {
				recordTokenEvent(state, textToCount);
			}
		}

		// Handle any usage field in the data
		if (isRecord(parsed) && parsed.usage) {
			applyUsageData(
				state,
				normalizeOpenAIUsage(parseOpenAIUsagePayload(parsed.usage)),
				state.usage.model,
			);
		}
	} catch {
		// Silent fail for non-JSON lines
	}
}

export function processStreamChunk(
	chunk: Uint8Array,
	state: RequestState,
): void {
	// Use module-level decoder in streaming mode (avoids per-chunk allocation)
	const text = streamDecoder.decode(chunk, { stream: true });
	state.buffer += text;
	state.lastActivity = Date.now();

	// Limit buffer size
	if (state.buffer.length > MAX_BUFFER_SIZE) {
		state.buffer = state.buffer.slice(-MAX_BUFFER_SIZE);
	}

	// Process incremental lines without splitting the whole buffer each time.
	// Scan for newlines from the end of previously-processed content.
	let currentEvent = state.currentSseEvent;
	let nlIndex = state.buffer.indexOf("\n");

	while (nlIndex !== -1) {
		const line = state.buffer.slice(0, nlIndex).trim();
		state.buffer = state.buffer.slice(nlIndex + 1);

		if (!line) {
			currentEvent = "";
		} else {
			const parsed = parseSSELine(line);
			if (parsed.event) {
				currentEvent = parsed.event;
			} else if (parsed.data) {
				extractUsageFromData(parsed.data, state);
			}
		}

		nlIndex = state.buffer.indexOf("\n");
	}

	state.currentSseEvent = currentEvent;
}

export function createRequestState(
	startMessage: StartMessage,
	overrides: Partial<RequestState> = {},
): RequestState {
	return {
		startMessage,
		buffer: "",
		chunks: [],
		chunksBytes: 0,
		payloadCapped: false,
		currentSseEvent: "",
		usage: {},
		lastActivity: Date.now(),
		clientSessionId: extractClientSessionIdFromHeaders(
			startMessage.requestHeaders,
		),
		tokenChunkCount: 0,
		tokenCurve: [],
		...overrides,
	};
}

function hasTrackedUsageData(state: RequestState): boolean {
	return (
		state.usage.inputTokens !== undefined ||
		state.usage.cacheReadInputTokens !== undefined ||
		state.usage.cacheCreationInputTokens !== undefined ||
		state.usage.outputTokens !== undefined ||
		state.usage.reasoningTokens !== undefined ||
		state.usage.outputTokensComputed !== undefined ||
		state.usage.totalTokens !== undefined ||
		state.providerFinalOutputTokens !== undefined
	);
}

async function handleStart(msg: StartMessage): Promise<void> {
	// Guard: cap concurrent tracked requests to prevent unbounded memory growth
	if (requests.size >= MAX_TRACKED_REQUESTS) {
		log.warn(
			`Tracked request cap reached (${MAX_TRACKED_REQUESTS}), skipping tracking for ${msg.requestId}`,
		);
		return;
	}

	// Check if we should skip logging this request
	const shouldSkip = !shouldLogRequest(msg.path, msg.responseStatus);

	// Create request state
	const state = createRequestState(msg, {
		shouldSkipLogging: shouldSkip,
	});

	requests.set(msg.requestId, state);

	// Skip all database operations for ignored requests
	if (shouldSkip) {
		log.debug(`Skipping logging for ${msg.path} (${msg.responseStatus})`);
		return;
	}

	// Save minimal request info immediately
	asyncWriter.enqueue(() =>
		dbOps.saveRequestMeta(
			msg.requestId,
			msg.method,
			msg.path,
			msg.providerName,
			msg.upstreamPath,
			msg.accountId,
			msg.responseStatus,
			msg.timestamp,
		),
	);

	// Update account usage if authenticated
	if (msg.accountId) {
		const accountId = msg.accountId; // Capture for closure
		asyncWriter.enqueue(() => dbOps.updateAccountUsage(accountId));
	}
}

function handleChunk(msg: ChunkMessage): void {
	const state = requests.get(msg.requestId);
	if (!state) {
		log.warn(`No state found for request ${msg.requestId}`);
		return;
	}

	// Store chunk for payload retention only if under the byte cap.
	// Usage extraction via processStreamChunk is independent and always runs.
	if (!state.payloadCapped) {
		if (state.chunksBytes + msg.data.length <= MAX_PAYLOAD_BYTES) {
			state.chunks.push(msg.data);
			state.chunksBytes += msg.data.length;
		} else {
			// Store a partial chunk to reach the cap, then stop
			const remaining = MAX_PAYLOAD_BYTES - state.chunksBytes;
			if (remaining > 0) {
				state.chunks.push(msg.data.slice(0, remaining));
				state.chunksBytes = MAX_PAYLOAD_BYTES;
			}
			state.payloadCapped = true;
			log.debug(
				`Payload cap reached for request ${msg.requestId} (${MAX_PAYLOAD_BYTES} bytes)`,
			);
		}
	}

	// Process for usage extraction (always, regardless of payload cap)
	processStreamChunk(msg.data, state);
}

async function handleEnd(msg: EndMessage): Promise<void> {
	const state = requests.get(msg.requestId);
	if (!state) {
		log.warn(`No state found for request ${msg.requestId}`);
		return;
	}

	const { startMessage } = state;
	const responseTime = Date.now() - startMessage.timestamp;

	// Skip all database operations for ignored requests
	if (state.shouldSkipLogging) {
		// Clean up state without logging
		requests.delete(msg.requestId);
		return;
	}

	// For non-stream responses, extract usage data from response body
	if (msg.preExtractedUsage) {
		applyUsageData(state, msg.preExtractedUsage, msg.preExtractedModel);
	} else if (!state.usage.model && msg.responseBody) {
		try {
			const decoded = Buffer.from(msg.responseBody, "base64").toString("utf-8");
			const json = JSON.parse(decoded);
			extractUsageFromJson(json, state);
		} catch {
			// Ignore parse errors
		}
	}

	if (msg.preExtractedModel && !state.usage.model) {
		setUsageModel(state, msg.preExtractedModel);
	}

	if (!state.usage.model) {
		setUsageModel(
			state,
			extractTrackedModelFromRequestBody(startMessage.requestBody),
		);
	}

	// Calculate total tokens and cost
	const usageModel =
		state.usage.model || (hasTrackedUsageData(state) ? "unknown" : undefined);
	if (usageModel) {
		if (!state.usage.model) {
			log.debug(
				`Usage model missing for request ${msg.requestId}, using fallback`,
				{
					provider: startMessage.providerName,
					path: startMessage.path,
				},
			);
		}
		state.usage.model = usageModel;

		// Use provider's authoritative count if available, fallback to computed
		const finalOutputTokens =
			state.providerFinalOutputTokens ??
			state.usage.outputTokens ??
			state.usage.outputTokensComputed ??
			0;

		// Update usage with final values
		state.usage.outputTokens = finalOutputTokens;
		state.usage.outputTokensComputed = undefined; // Clear to avoid confusion

		state.usage.totalTokens =
			(state.usage.inputTokens || 0) +
			finalOutputTokens +
			(state.usage.cacheReadInputTokens || 0) +
			(state.usage.cacheCreationInputTokens || 0);

		state.usage.costUsd =
			usageModel === "unknown"
				? 0
				: await estimateCostUSD(
						usageModel,
						{
							inputTokens: state.usage.inputTokens,
							outputTokens: finalOutputTokens,
							cacheReadInputTokens: state.usage.cacheReadInputTokens,
							cacheCreationInputTokens: state.usage.cacheCreationInputTokens,
						},
						{ provider: startMessage.providerName },
					);

		// Calculate tokens per second using actual streaming duration
		if (finalOutputTokens > 0) {
			const durationMs = durationBetween(
				state.firstTokenTimestamp,
				state.lastTokenTimestamp,
			);
			if (durationMs !== null && durationMs > 0) {
				state.usage.tokensPerSecond = finalOutputTokens / (durationMs / 1000);
			} else if (durationMs !== null) {
				state.usage.tokensPerSecond = finalOutputTokens / 0.001;
			}
		}
	}

	let responseBody: string | null = null;

	if (msg.responseBody) {
		// Non-streaming response
		responseBody = msg.responseBody;
	} else if (state.chunks.length > 0) {
		// Streaming response - combine chunks
		const combined = combineChunks(state.chunks);
		if (combined.length > 0) {
			responseBody = combined.toString("base64");
		}
	}

	const timings = {
		ttftMs: durationBetween(startMessage.timestamp, state.firstTokenTimestamp),
		proxyOverheadMs: durationBetween(
			startMessage.timestamp,
			startMessage.upstreamRequestStartedAt,
		),
		upstreamTtfbMs: durationBetween(
			startMessage.upstreamRequestStartedAt,
			startMessage.responseHeadersReceivedAt,
		),
		streamingDurationMs: durationBetween(
			state.firstTokenTimestamp,
			state.lastTokenTimestamp,
		),
	};

	const payload: RequestPayload = {
		id: startMessage.requestId,
		request: {
			headers: startMessage.requestHeaders,
			body: startMessage.requestBody,
		},
		response: {
			status: startMessage.responseStatus,
			headers: startMessage.responseHeaders,
			body: responseBody,
		},
		meta: {
			trace: {
				timestamp: startMessage.timestamp,
				provider: startMessage.providerName,
				upstreamPath: startMessage.upstreamPath,
				path: startMessage.path,
				method: startMessage.method,
			},
			account: {
				id: startMessage.accountId,
			},
			transport: {
				success: msg.success,
				isStream: startMessage.isStream,
				retry: startMessage.retryAttempt,
				ttftMs: timings.ttftMs,
				proxyOverheadMs: timings.proxyOverheadMs,
				upstreamTtfbMs: timings.upstreamTtfbMs,
				streamingDurationMs: timings.streamingDurationMs,
				tokenCurve: state.tokenCurve.length > 0 ? state.tokenCurve : null,
			},
		},
	};
	const linkage = extractRequestLinkageFromPayload(payload);
	const clientSessionId =
		linkage.clientSessionId ?? state.clientSessionId ?? null;
	payload.meta.trace.responseId = linkage.responseId;
	payload.meta.trace.previousResponseId = linkage.previousResponseId;
	payload.meta.trace.clientSessionId = clientSessionId;

	// Update request summary and payload atomically
	asyncWriter.enqueue(() =>
		dbOps.saveRequest(
			startMessage.requestId,
			startMessage.method,
			startMessage.path,
			startMessage.providerName,
			startMessage.upstreamPath,
			startMessage.accountId,
			startMessage.responseStatus,
			msg.success,
			msg.error || null,
			responseTime,
			startMessage.failoverAttempts,
			state.usage.model
				? {
						model: state.usage.model,
						promptTokens:
							(state.usage.inputTokens || 0) +
							(state.usage.cacheReadInputTokens || 0) +
							(state.usage.cacheCreationInputTokens || 0),
						completionTokens: state.usage.outputTokens,
						totalTokens: state.usage.totalTokens,
						costUsd: state.usage.costUsd,
						// Keep original breakdown for payload
						inputTokens: state.usage.inputTokens,
						outputTokens: state.usage.outputTokens,
						cacheReadInputTokens: state.usage.cacheReadInputTokens,
						cacheCreationInputTokens: state.usage.cacheCreationInputTokens,
						reasoningTokens: state.usage.reasoningTokens,
						tokensPerSecond: state.usage.tokensPerSecond,
					}
				: undefined,
			{
				timestamp: startMessage.timestamp,
				payload,
				timings,
			},
		),
	);

	// Log if we have usage
	if (state.usage.model && startMessage.accountId !== null) {
		log.info(
			`Usage for request ${startMessage.requestId}: Model: ${state.usage.model}, ` +
				`Tokens: ${state.usage.totalTokens || 0}, Cost: ${formatCost(state.usage.costUsd)}`,
		);
	}

	// Post summary to main thread for real-time updates
	const summary: RequestSummary = {
		id: startMessage.requestId,
		timestamp: new Date(startMessage.timestamp).toISOString(),
		method: startMessage.method,
		path: startMessage.path,
		provider: startMessage.providerName,
		upstreamPath: startMessage.upstreamPath,
		accountUsed: startMessage.accountId,
		accountName: null,
		statusCode: startMessage.responseStatus,
		success: msg.success,
		errorMessage: msg.error || null,
		responseTimeMs: responseTime,
		failoverAttempts: startMessage.failoverAttempts,
		model: state.usage.model ?? null,
		promptTokens: state.usage.inputTokens ?? null,
		completionTokens: state.usage.outputTokens ?? null,
		totalTokens: state.usage.totalTokens ?? null,
		inputTokens: state.usage.inputTokens ?? null,
		cacheReadInputTokens: state.usage.cacheReadInputTokens ?? null,
		cacheCreationInputTokens: state.usage.cacheCreationInputTokens ?? null,
		reasoningTokens: state.usage.reasoningTokens ?? null,
		outputTokens: state.usage.outputTokens ?? null,
		costUsd: state.usage.costUsd ?? null,
		tokensPerSecond: state.usage.tokensPerSecond ?? null,
		ttftMs: timings.ttftMs,
		proxyOverheadMs: timings.proxyOverheadMs,
		upstreamTtfbMs: timings.upstreamTtfbMs,
		streamingDurationMs: timings.streamingDurationMs,
		responseId: linkage.responseId,
		previousResponseId: linkage.previousResponseId,
		responseChainId: null,
		clientSessionId,
	};

	self.postMessage({
		type: "summary",
		summary,
	} satisfies SummaryMessage);

	self.postMessage({
		type: "payload",
		payload: { ...payload, error: msg.error },
	} satisfies PayloadMessage);

	// Clean up
	requests.delete(msg.requestId);
}

async function handleShutdown(): Promise<void> {
	log.info("Worker shutting down, flushing async writer...");

	if (cleanupIntervalId) {
		clearInterval(cleanupIntervalId);
		cleanupIntervalId = null;
	}

	for (const requestId of Array.from(requests.keys())) {
		await handleEnd({
			type: "end",
			requestId,
			success: false,
			error: "Request interrupted by shutdown",
		});
	}

	await asyncWriter.dispose();
	dbOps.close();
	self.postMessage({
		type: "shutdown-complete",
		asyncWriter: {
			healthy: asyncWriter.isHealthy(),
			failureCount: asyncWriter.getFailureCount(),
			queuedJobs: asyncWriter.getQueueSize(),
		},
	} satisfies ShutdownCompleteMessage);
}

function acknowledgeMessage(message: IncomingWorkerMessage): void {
	if (!message.messageId) {
		return;
	}

	self.postMessage({
		type: "ack",
		messageId: message.messageId,
		requestId: "requestId" in message ? message.requestId : undefined,
		acknowledgedType: message.type,
	} satisfies AckMessage);
}

// Periodic cleanup of stale requests (safety net for orphaned requests)
// This should rarely trigger as the main app handles timeouts
function cleanupStaleRequests(): void {
	const now = Date.now();
	for (const [id, state] of requests) {
		if (now - state.lastActivity > TIMEOUT_MS) {
			log.warn(
				`Request ${id} appears orphaned (no activity for ${TIMEOUT_MS}ms), cleaning up...`,
			);
			handleEnd({
				type: "end",
				requestId: id,
				success: false,
				error: "Request orphaned - no activity",
			});
		}
	}
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
	cleanupIntervalId = setInterval(cleanupStaleRequests, TIMEOUT_MS); // Check every TIMEOUT_MS

	// Message handler
	self.onmessage = (event: MessageEvent<IncomingWorkerMessage>) => {
		const msg = event.data;
		acknowledgeMessage(msg);

		messageProcessingQueue = messageProcessingQueue
			.then(async () => {
				switch (msg.type) {
					case "start":
						await handleStart(msg);
						break;
					case "chunk":
						handleChunk(msg);
						break;
					case "end":
						await handleEnd(msg);
						break;
					case "shutdown":
						await handleShutdown();
						break;
				}
			})
			.catch((error) => {
				log.error("Failed to process usage worker message", error);
			});
	};

	self.postMessage({
		type: "ready",
	} satisfies ReadyMessage);
}
