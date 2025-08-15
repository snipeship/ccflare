import { BaseRepository } from "./base.repository";

export interface RequestData {
	id: string;
	method: string;
	path: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean;
	errorMessage: string | null;
	responseTime: number;
	failoverAttempts: number;
	agentUsed?: string;
	clientIp?: string;
	usage?: {
		model?: string;
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
		costUsd?: number;
		inputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		outputTokens?: number;
		tokensPerSecond?: number;
	};
}

export class RequestRepository extends BaseRepository<RequestData> {
	saveMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
		clientIp?: string,
	): void {
		this.run(
			`
			INSERT INTO requests (
				id, timestamp, method, path, account_used, 
				status_code, success, error_message, response_time_ms, failover_attempts, client_ip
			)
			VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, ?)
		`,
			[
				id,
				timestamp || Date.now(),
				method,
				path,
				accountUsed,
				statusCode,
				clientIp || null,
			],
		);
	}

	save(data: RequestData): void {
		const { usage } = data;
		this.run(
			`
			INSERT OR REPLACE INTO requests (
				id, timestamp, method, path, account_used, 
				status_code, success, error_message, response_time_ms, failover_attempts,
				model, prompt_tokens, completion_tokens, total_tokens, cost_usd,
				input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens,
				agent_used, output_tokens_per_second, client_ip
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			[
				data.id,
				Date.now(),
				data.method,
				data.path,
				data.accountUsed,
				data.statusCode,
				data.success ? 1 : 0,
				data.errorMessage,
				data.responseTime,
				data.failoverAttempts,
				usage?.model || null,
				usage?.promptTokens || null,
				usage?.completionTokens || null,
				usage?.totalTokens || null,
				usage?.costUsd || null,
				usage?.inputTokens || null,
				usage?.cacheReadInputTokens || null,
				usage?.cacheCreationInputTokens || null,
				usage?.outputTokens || null,
				data.agentUsed || null,
				usage?.tokensPerSecond || null,
				data.clientIp || null,
			],
		);
	}

	updateUsage(requestId: string, usage: RequestData["usage"]): void {
		if (!usage) return;

		this.run(
			`
			UPDATE requests
			SET 
				model = COALESCE(?, model),
				prompt_tokens = COALESCE(?, prompt_tokens),
				completion_tokens = COALESCE(?, completion_tokens),
				total_tokens = COALESCE(?, total_tokens),
				cost_usd = COALESCE(?, cost_usd),
				input_tokens = COALESCE(?, input_tokens),
				cache_read_input_tokens = COALESCE(?, cache_read_input_tokens),
				cache_creation_input_tokens = COALESCE(?, cache_creation_input_tokens),
				output_tokens = COALESCE(?, output_tokens),
				output_tokens_per_second = COALESCE(?, output_tokens_per_second)
			WHERE id = ?
		`,
			[
				usage.model || null,
				usage.promptTokens || null,
				usage.completionTokens || null,
				usage.totalTokens || null,
				usage.costUsd || null,
				usage.inputTokens || null,
				usage.cacheReadInputTokens || null,
				usage.cacheCreationInputTokens || null,
				usage.outputTokens || null,
				usage.tokensPerSecond || null,
				requestId,
			],
		);
	}

	// Payload management
	savePayload(id: string, data: unknown): void {
		const json = JSON.stringify(data);
		this.run(
			`INSERT OR REPLACE INTO request_payloads (id, json) VALUES (?, ?)`,
			[id, json],
		);
	}

	getPayload(id: string): unknown | null {
		const row = this.get<{ json: string }>(
			`SELECT json FROM request_payloads WHERE id = ?`,
			[id],
		);

		if (!row) return null;

		try {
			return JSON.parse(row.json);
		} catch {
			return null;
		}
	}

	listPayloads(limit = 50): Array<{ id: string; json: string }> {
		return this.query<{ id: string; json: string }>(
			`
			SELECT rp.id, rp.json 
			FROM request_payloads rp
			JOIN requests r ON rp.id = r.id
			ORDER BY r.timestamp DESC
			LIMIT ?
		`,
			[limit],
		);
	}

	listPayloadsWithAccountNames(
		limit = 50,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.query<{
			id: string;
			json: string;
			account_name: string | null;
		}>(
			`
			SELECT rp.id, rp.json, a.name as account_name
			FROM request_payloads rp
			JOIN requests r ON rp.id = r.id
			LEFT JOIN accounts a ON r.account_used = a.id
			ORDER BY r.timestamp DESC
			LIMIT ?
		`,
			[limit],
		);
	}

	// Analytics queries
	getRecentRequests(limit = 100): Array<{
		id: string;
		timestamp: number;
		method: string;
		path: string;
		account_used: string | null;
		status_code: number | null;
		success: boolean;
		response_time_ms: number | null;
	}> {
		return this.query<{
			id: string;
			timestamp: number;
			method: string;
			path: string;
			account_used: string | null;
			status_code: number | null;
			success: 0 | 1;
			response_time_ms: number | null;
		}>(
			`
			SELECT id, timestamp, method, path, account_used, status_code, success, response_time_ms
			FROM requests
			ORDER BY timestamp DESC
			LIMIT ?
		`,
			[limit],
		).map((row) => ({
			...row,
			success: row.success === 1,
		}));
	}

	getRequestStats(since?: number): {
		totalRequests: number;
		successfulRequests: number;
		failedRequests: number;
		avgResponseTime: number | null;
	} {
		const whereClause = since ? "WHERE timestamp > ?" : "";
		const params = since ? [since] : [];

		const result = this.get<{
			total_requests: number;
			successful_requests: number;
			failed_requests: number;
			avg_response_time: number | null;
		}>(
			`
			SELECT 
				COUNT(*) as total_requests,
				SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
				SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
				AVG(response_time_ms) as avg_response_time
			FROM requests
			${whereClause}
		`,
			params,
		);

		return {
			totalRequests: result?.total_requests || 0,
			successfulRequests: result?.successful_requests || 0,
			failedRequests: result?.failed_requests || 0,
			avgResponseTime: result?.avg_response_time || null,
		};
	}

	/**
	 * Aggregate statistics with optional time range
	 * Consolidates duplicate SQL queries from stats handlers
	 */
	aggregateStats(rangeMs?: number): {
		totalRequests: number;
		successfulRequests: number;
		avgResponseTime: number | null;
		totalTokens: number;
		totalCostUsd: number;
		inputTokens: number;
		outputTokens: number;
		cacheReadInputTokens: number;
		cacheCreationInputTokens: number;
		avgTokensPerSecond: number | null;
	} {
		const whereClause = rangeMs ? "WHERE timestamp > ?" : "";
		const params = rangeMs ? [Date.now() - rangeMs] : [];

		const result = this.get<{
			total_requests: number;
			successful_requests: number;
			avg_response_time: number | null;
			total_tokens: number | null;
			total_cost_usd: number | null;
			input_tokens: number | null;
			output_tokens: number | null;
			cache_read_input_tokens: number | null;
			cache_creation_input_tokens: number | null;
			avg_tokens_per_second: number | null;
		}>(
			`
			SELECT 
				COUNT(*) as total_requests,
				SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
				AVG(response_time_ms) as avg_response_time,
				SUM(total_tokens) as total_tokens,
				SUM(cost_usd) as total_cost_usd,
				SUM(input_tokens) as input_tokens,
				SUM(output_tokens) as output_tokens,
				SUM(cache_read_input_tokens) as cache_read_input_tokens,
				SUM(cache_creation_input_tokens) as cache_creation_input_tokens,
				AVG(output_tokens_per_second) as avg_tokens_per_second
			FROM requests
			${whereClause}
		`,
			params,
		);

		return {
			totalRequests: result?.total_requests || 0,
			successfulRequests: result?.successful_requests || 0,
			avgResponseTime: result?.avg_response_time || null,
			totalTokens: result?.total_tokens || 0,
			totalCostUsd: result?.total_cost_usd || 0,
			inputTokens: result?.input_tokens || 0,
			outputTokens: result?.output_tokens || 0,
			cacheReadInputTokens: result?.cache_read_input_tokens || 0,
			cacheCreationInputTokens: result?.cache_creation_input_tokens || 0,
			avgTokensPerSecond: result?.avg_tokens_per_second || null,
		};
	}

	/**
	 * Get top models by usage
	 */
	getTopModels(limit = 10): Array<{ model: string; count: number }> {
		return this.query<{ model: string; count: number }>(
			`
			SELECT model, COUNT(*) as count
			FROM requests
			WHERE model IS NOT NULL
			GROUP BY model
			ORDER BY count DESC
			LIMIT ?
		`,
			[limit],
		);
	}

	/**
	 * Get recent error messages
	 */
	getRecentErrors(limit = 10): string[] {
		const errors = this.query<{ error_message: string }>(
			`
			SELECT error_message
			FROM requests
			WHERE success = 0 AND error_message IS NOT NULL
			ORDER BY timestamp DESC
			LIMIT ?
		`,
			[limit],
		);
		return errors.map((e: { error_message: string }) => e.error_message);
	}

	getRequestsByAccount(since?: number): Array<{
		accountId: string;
		accountName: string | null;
		requestCount: number;
		successRate: number;
	}> {
		const whereClause = since ? "WHERE r.timestamp > ?" : "";
		const params = since ? [since] : [];

		return this.query<{
			account_id: string;
			account_name: string | null;
			request_count: number;
			success_rate: number;
		}>(
			`
			SELECT 
				r.account_used as account_id,
				a.name as account_name,
				COUNT(*) as request_count,
				SUM(CASE WHEN r.success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
			FROM requests r
			LEFT JOIN accounts a ON r.account_used = a.id
			${whereClause}
			GROUP BY r.account_used
			ORDER BY request_count DESC
		`,
			params,
		).map((row) => ({
			accountId: row.account_id,
			accountName: row.account_name,
			requestCount: row.request_count,
			successRate: row.success_rate,
		}));
	}
}
