import { DatabaseFactory } from "@ccflare/database";
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
	clientIp?: string;
}

export async function getRequests(limit = 100): Promise<RequestPayload[]> {
	const dbOps = DatabaseFactory.getInstance();
	const rows = dbOps.listRequestPayloads(limit);

	const parsed = rows.map((r: { id: string; json: string }) => {
		try {
			const data = JSON.parse(r.json);
			// Add account name if we have accountId
			if (data.meta?.accountId) {
				const account = dbOps.getAccount(data.meta.accountId);
				if (account) {
					data.meta.accountName = account.name;
				}
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

export async function getRequestSummaries(
	limit = 100,
): Promise<Map<string, RequestSummary>> {
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();

	const summaries = db
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
			response_time_ms as responseTimeMs,
			client_ip as clientIp
		FROM requests
		ORDER BY timestamp DESC
		LIMIT ?
	`)
		.all(limit) as Array<{
		id: string;
		model?: string;
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		costUsd?: number;
		responseTimeMs?: number;
		clientIp?: string;
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
			clientIp: summary.clientIp || undefined,
		});
	});

	return summaryMap;
}
