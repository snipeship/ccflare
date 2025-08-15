import { DatabaseFactory, withDatabaseRetrySync } from "@ccflare/database";
import type { RequestPayload } from "@ccflare/types";

export type { RequestPayload };

export interface RequestSummary {
	id: string;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	costUsd?: number;
	responseTimeMs?: number;
}

export async function getRequests(limit = 100): Promise<RequestPayload[]> {
	const dbOps = DatabaseFactory.getInstance();

	// Use the optimized database method that includes account names in a single JOIN
	// This eliminates N+1 queries and uses the performance-optimized method
	const rows = withDatabaseRetrySync(() => {
		return dbOps.listRequestPayloadsWithAccountNames(limit);
	}, dbOps.getRetryConfig(), "getRequests");

	const parsed = rows.map((r: { id: string; json: string; account_name: string | null }) => {
		try {
			const data = JSON.parse(r.json);
			// Add account name from the JOIN result (no additional query needed)
			if (r.account_name && data.meta) {
				data.meta.accountName = r.account_name;
			}
			return { id: r.id, ...data } as RequestPayload;
		} catch {
			return {
				id: r.id,
				error: "Failed to parse payload",
				request: { headers: {}, body: null },
				response: null,
				meta: { timestamp: Date.now() },
			} as RequestPayload;
		}
	});

	return parsed;
}

/**
 * Get full request payload data for a specific request (for detailed view)
 */
export async function getRequestPayload(requestId: string): Promise<RequestPayload | null> {
	const dbOps = DatabaseFactory.getInstance();

	const payload = withDatabaseRetrySync(() => {
		return dbOps.getRequestPayload(requestId);
	}, dbOps.getRetryConfig(), "getRequestPayload");

	return payload as RequestPayload | null;
}

export async function getRequestSummaries(
	limit = 100,
): Promise<Map<string, RequestSummary>> {
	const dbOps = DatabaseFactory.getInstance();

	// Use retry logic for the database query
	const summaries = withDatabaseRetrySync(() => {
		const db = dbOps.getDatabase();
		return db
			.query(`
			SELECT
				id,
				model,
				input_tokens as inputTokens,
				output_tokens as outputTokens,
				total_tokens as totalTokens,
				cache_read_input_tokens as cacheReadInputTokens,
				cache_creation_input_tokens as cacheCreationInputTokens,
				cost_usd as costUsd,
				response_time_ms as responseTimeMs
			FROM requests
			ORDER BY timestamp DESC
			LIMIT ?
		`)
			.all(limit);
	}, dbOps.getRetryConfig(), "getRequestSummaries") as Array<{
		id: string;
		model?: string;
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		costUsd?: number;
		responseTimeMs?: number;
	}>;

	const summaryMap = new Map<string, RequestSummary>();
	summaries.forEach((summary) => {
		summaryMap.set(summary.id, {
			id: summary.id,
			model: summary.model || undefined,
			inputTokens: summary.inputTokens || undefined,
			outputTokens: summary.outputTokens || undefined,
			totalTokens: summary.totalTokens || undefined,
			cacheReadInputTokens: summary.cacheReadInputTokens || undefined,
			cacheCreationInputTokens: summary.cacheCreationInputTokens || undefined,
			costUsd: summary.costUsd || undefined,
			responseTimeMs: summary.responseTimeMs || undefined,
		});
	});

	return summaryMap;
}
