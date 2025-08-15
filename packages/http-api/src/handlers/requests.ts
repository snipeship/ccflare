import type { Database } from "bun:sqlite";
import type { DatabaseOperations } from "@ccflare/database";
import { jsonResponse } from "@ccflare/http-common";
import type { RequestResponse } from "../types";

/**
 * Create a requests summary handler (existing functionality)
 */
export function createRequestsSummaryHandler(db: Database) {
	return (limit: number = 50): Response => {
		const requests = db
			.query(
				`
				SELECT r.*, a.name as account_name
				FROM requests r
				LEFT JOIN accounts a ON r.account_used = a.id
				ORDER BY r.timestamp DESC
				LIMIT ?1
			`,
			)
			.all(limit) as Array<{
			id: string;
			timestamp: number;
			method: string;
			path: string;
			account_used: string | null;
			account_name: string | null;
			status_code: number | null;
			success: 0 | 1;
			error_message: string | null;
			response_time_ms: number | null;
			failover_attempts: number;
			model: string | null;
			prompt_tokens: number | null;
			completion_tokens: number | null;
			total_tokens: number | null;
			input_tokens: number | null;
			cache_read_input_tokens: number | null;
			cache_creation_input_tokens: number | null;
			output_tokens: number | null;
			cost_usd: number | null;
			agent_used: string | null;
			output_tokens_per_second: number | null;
			client_ip: string | null;
		}>;

		const response: RequestResponse[] = requests.map((request) => ({
			id: request.id,
			timestamp: new Date(request.timestamp).toISOString(),
			method: request.method,
			path: request.path,
			accountUsed: request.account_name || request.account_used,
			statusCode: request.status_code,
			success: request.success === 1,
			errorMessage: request.error_message,
			responseTimeMs: request.response_time_ms,
			failoverAttempts: request.failover_attempts,
			model: request.model || undefined,
			promptTokens: request.prompt_tokens || undefined,
			completionTokens: request.completion_tokens || undefined,
			totalTokens: request.total_tokens || undefined,
			inputTokens: request.input_tokens || undefined,
			cacheReadInputTokens: request.cache_read_input_tokens || undefined,
			cacheCreationInputTokens:
				request.cache_creation_input_tokens || undefined,
			outputTokens: request.output_tokens || undefined,
			costUsd: request.cost_usd || undefined,
			agentUsed: request.agent_used || undefined,
			tokensPerSecond: request.output_tokens_per_second || undefined,
			clientIp: request.client_ip || undefined,
		}));

		return jsonResponse(response);
	};
}

/**
 * Create a detailed requests handler with full payload data
 */
export function createRequestsDetailHandler(dbOps: DatabaseOperations) {
	return (limit = 100): Response => {
		const rows = dbOps.listRequestPayloadsWithAccountNames(limit);
		const parsed = rows.map((r) => {
			try {
				const data = JSON.parse(r.json);
				// Add account name to the meta field if available
				if (r.account_name && data.meta) {
					data.meta.accountName = r.account_name;
				}
				return { id: r.id, ...data };
			} catch {
				return { id: r.id, error: "Failed to parse payload" };
			}
		});

		return jsonResponse(parsed);
	};
}
