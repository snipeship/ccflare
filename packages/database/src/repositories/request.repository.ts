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

export interface SearchFilters {
	accountId?: string;
	method?: string;
	path?: string;
	statusCode?: number;
	success?: boolean;
	dateFrom?: number;
	dateTo?: number;
	model?: string;
	agentUsed?: string;
	limit?: number;
	offset?: number;
}

export interface SearchResult {
	id: string;
	timestamp: number;
	method: string;
	path: string;
	accountUsed: string | null;
	accountName: string | null;
	statusCode: number | null;
	success: boolean;
	responseTime: number;
	model: string | null;
	agentUsed: string | null;
	requestSnippet?: string; // For backward compatibility
	responseSnippet?: string; // For backward compatibility
	requestSnippets?: string[]; // Multiple snippets
	responseSnippets?: string[]; // Multiple snippets
	rank: number;
}

export class RequestRepository extends BaseRepository<RequestData> {
	saveMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
	): void {
		this.run(
			`
			INSERT INTO requests (
				id, timestamp, method, path, account_used, 
				status_code, success, error_message, response_time_ms, failover_attempts
			)
			VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, 0)
		`,
			[id, timestamp || Date.now(), method, path, accountUsed, statusCode],
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
				agent_used, output_tokens_per_second
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

		// Also update FTS table with decoded content
		try {
			const payload = data as {
				request?: { body?: string };
				response?: { body?: string };
			};
			const requestBody = this.decodeBase64Content(payload.request?.body || "");
			const responseBody = this.decodeBase64Content(
				payload.response?.body || "",
			);

			// Check if FTS record exists
			const exists = this.get<{ id: string }>(
				`SELECT id FROM request_payloads_fts WHERE id = ?`,
				[id],
			);

			if (exists) {
				this.run(
					`UPDATE request_payloads_fts SET request_body = ?, response_body = ? WHERE id = ?`,
					[requestBody, responseBody, id],
				);
			} else {
				this.run(
					`INSERT INTO request_payloads_fts (id, request_body, response_body) VALUES (?, ?, ?)`,
					[id, requestBody, responseBody],
				);
			}
		} catch (error) {
			// Log error but don't fail the main operation
			console.error(`Failed to update FTS for ${id}:`, error);
		}
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

	/**
	 * Comprehensive search with filters and metadata
	 */
	getSearchResults(
		query: string,
		filters: SearchFilters = {},
	): Array<SearchResult> {
		const {
			accountId,
			method,
			path,
			statusCode,
			success,
			dateFrom,
			dateTo,
			model,
			agentUsed,
			limit = 50,
			offset = 0,
		} = filters;

		// Build WHERE conditions
		const conditions: string[] = ["request_payloads_fts MATCH ?"];
		const params: (string | number)[] = [query];

		if (accountId) {
			conditions.push("r.account_used = ?");
			params.push(accountId);
		}

		if (method) {
			conditions.push("r.method = ?");
			params.push(method);
		}

		if (path) {
			conditions.push("r.path LIKE ?");
			params.push(`%${path}%`);
		}

		if (statusCode !== undefined) {
			conditions.push("r.status_code = ?");
			params.push(statusCode);
		}

		if (success !== undefined) {
			conditions.push("r.success = ?");
			params.push(success ? 1 : 0);
		}

		if (dateFrom) {
			conditions.push("r.timestamp >= ?");
			params.push(dateFrom);
		}

		if (dateTo) {
			conditions.push("r.timestamp <= ?");
			params.push(dateTo);
		}

		if (model) {
			conditions.push("r.model = ?");
			params.push(model);
		}

		if (agentUsed) {
			conditions.push("r.agent_used = ?");
			params.push(agentUsed);
		}

		params.push(limit, offset);

		const whereClause = conditions.join(" AND ");

		const results = this.query<{
			id: string;
			timestamp: number;
			method: string;
			path: string;
			account_used: string | null;
			account_name: string | null;
			status_code: number | null;
			success: 0 | 1;
			response_time_ms: number;
			model: string | null;
			agent_used: string | null;
			rank: number;
			request_snippet: string;
			response_snippet: string;
		}>(
			`
			SELECT 
				r.id,
				r.timestamp,
				r.method,
				r.path,
				r.account_used,
				a.name as account_name,
				r.status_code,
				r.success,
				r.response_time_ms,
				r.model,
				r.agent_used,
				fts.rank,
				snippet(request_payloads_fts, 1, '<mark>', '</mark>', '...', 32) as request_snippet,
				snippet(request_payloads_fts, 2, '<mark>', '</mark>', '...', 32) as response_snippet
			FROM request_payloads_fts fts
			JOIN requests r ON fts.id = r.id
			LEFT JOIN accounts a ON r.account_used = a.id
			WHERE ${whereClause}
			ORDER BY r.timestamp DESC
			LIMIT ? OFFSET ?
		`,
			params,
		);

		return results.map((row) => ({
			id: row.id,
			timestamp: row.timestamp,
			method: row.method,
			path: row.path,
			accountUsed: row.account_used,
			accountName: row.account_name,
			statusCode: row.status_code,
			success: row.success === 1,
			responseTime: row.response_time_ms,
			model: row.model,
			agentUsed: row.agent_used,
			rank: row.rank,
			requestSnippet: row.request_snippet, // Already decoded by snippet()
			responseSnippet: row.response_snippet, // Already decoded by snippet()
		}));
	}

	/**
	 * Helper method to decode base64 content safely
	 */
	private decodeBase64Content(content: string): string {
		if (!content || content === "[streamed]" || content === "") {
			return content;
		}

		try {
			// Check if the content looks like base64 (and is long enough to be meaningful)
			if (content.length > 10 && /^[A-Za-z0-9+/]+=*$/.test(content)) {
				return Buffer.from(content, "base64").toString("utf-8");
			}
			return content;
		} catch {
			// If decoding fails, return original content
			return content;
		}
	}
}
