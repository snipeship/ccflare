/**
 * Unified message protocol for main thread <-> worker communication
 * Handles both streaming and non-streaming responses
 */

export interface StartMessage {
	type: "start";
	requestId: string;
	accountId: string | null;
	method: string;
	path: string;
	timestamp: number;

	// Request details
	requestHeaders: Record<string, string>;
	requestBody: string | null; // base64 encoded

	// Response details
	responseStatus: number;
	responseHeaders: Record<string, string>;
	isStream: boolean;

	// Provider info for rate limit parsing
	providerName: string;

	// Agent info
	agentUsed: string | null;

	// Client IP
	clientIp: string | null;

	// Retry info
	retryAttempt: number;
	failoverAttempts: number;
}

export interface ChunkMessage {
	type: "chunk";
	requestId: string;
	data: Uint8Array;
}

export interface EndMessage {
	type: "end";
	requestId: string;
	responseBody?: string | null; // base64 encoded, for non-streaming
	success: boolean;
	error?: string;
}

export interface ControlMessage {
	type: "shutdown";
}

export type WorkerMessage =
	| StartMessage
	| ChunkMessage
	| EndMessage
	| ControlMessage
	| SummaryMessage
	| PayloadMessage;

// Response from worker (if needed in future)
export interface WorkerResponse {
	type: "ack" | "error";
	requestId?: string;
	message?: string;
}

// Worker to main thread messages
export interface SummaryMessage {
	type: "summary";
	summary: import("@ccflare/types").RequestResponse;
}

export interface PayloadMessage {
	type: "payload";
	payload: import("@ccflare/types").RequestPayload;
}

export type OutgoingWorkerMessage = SummaryMessage | PayloadMessage;
