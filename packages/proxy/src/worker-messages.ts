/**
 * Unified message protocol for main thread <-> worker communication
 * Handles both streaming and non-streaming responses
 */

import type {
	AccountProvider,
	AsyncWriterHealth,
	HttpMethod,
} from "@ccflare/types";

export interface StartMessage {
	type: "start";
	messageId?: string;
	requestId: string;
	accountId: string | null;
	method: HttpMethod;
	path: string;
	upstreamPath: string;
	timestamp: number;
	upstreamRequestStartedAt?: number;
	responseHeadersReceivedAt?: number;

	// Request details
	requestHeaders: Record<string, string>;
	requestBody: string | null; // base64 encoded

	// Response details
	responseStatus: number;
	responseHeaders: Record<string, string>;
	isStream: boolean;

	// Provider info for rate limit parsing
	providerName: AccountProvider;

	// Retry info
	retryAttempt: number;
	failoverAttempts: number;
}

export interface ChunkMessage {
	type: "chunk";
	messageId?: string;
	requestId: string;
	data: Uint8Array;
}

export interface PreExtractedUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	input_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
	output_tokens?: number;
	reasoning_tokens?: number;
}

export interface EndMessage {
	type: "end";
	messageId?: string;
	requestId: string;
	responseBody?: string | null; // base64 encoded, for non-streaming
	preExtractedUsage?: PreExtractedUsage;
	preExtractedModel?: string;
	success: boolean;
	error?: string;
}

export interface ControlMessage {
	type: "shutdown";
	messageId?: string;
}

export type IncomingWorkerMessage =
	| StartMessage
	| ChunkMessage
	| EndMessage
	| ControlMessage;

export interface ReadyMessage {
	type: "ready";
}

export interface AckMessage {
	type: "ack";
	messageId: string;
	requestId?: string;
	acknowledgedType: "start" | "chunk" | "end" | "shutdown";
}

export interface ShutdownCompleteMessage {
	type: "shutdown-complete";
	asyncWriter: AsyncWriterHealth;
}

// Worker to main thread messages
export interface SummaryMessage {
	type: "summary";
	summary: import("@ccflare/types").RequestSummary;
}

export function createCompletionMessages(
	summary: import("@ccflare/types").RequestSummary,
): SummaryMessage[] {
	return [{ type: "summary", summary }];
}

export type OutgoingWorkerMessage =
	| SummaryMessage
	| ReadyMessage
	| AckMessage
	| ShutdownCompleteMessage;
export type WorkerMessage = IncomingWorkerMessage | OutgoingWorkerMessage;
