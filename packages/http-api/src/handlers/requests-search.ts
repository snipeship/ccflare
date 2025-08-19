import { validateNumber, validateString } from "@ccflare/core";
import type { DatabaseOperations, SearchFilters } from "@ccflare/database";
import { jsonResponse } from "@ccflare/http-common";

/**
 * Create a requests search handler for full-text search functionality
 */
export function createRequestsSearchHandler(dbOps: DatabaseOperations) {
	return async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		const query = url.searchParams.get("q");

		if (!query || query.trim() === "") {
			return jsonResponse(
				{
					error: "Search query is required",
					results: [],
					total: 0,
				},
				400,
			);
		}

		// Parse search parameters
		const limitParam = url.searchParams.get("limit");
		const offsetParam = url.searchParams.get("offset");
		const accountIdParam = url.searchParams.get("accountId");
		const methodParam = url.searchParams.get("method");
		const pathParam = url.searchParams.get("path");
		const statusCodeParam = url.searchParams.get("statusCode");
		const successParam = url.searchParams.get("success");
		const dateFromParam = url.searchParams.get("dateFrom");
		const dateToParam = url.searchParams.get("dateTo");
		const modelParam = url.searchParams.get("model");
		const agentUsedParam = url.searchParams.get("agentUsed");

		// Validate and build filters
		const filters: SearchFilters = {
			limit:
				validateNumber(limitParam || "50", "limit", {
					min: 1,
					max: 200,
					integer: true,
				}) || 50,
			offset:
				validateNumber(offsetParam || "0", "offset", {
					min: 0,
					integer: true,
				}) || 0,
		};

		if (accountIdParam) {
			filters.accountId = validateString(accountIdParam, "accountId", {
				minLength: 1,
				maxLength: 100,
			});
		}

		if (methodParam) {
			filters.method = validateString(methodParam, "method", {
				minLength: 1,
				maxLength: 10,
			});
		}

		if (pathParam) {
			filters.path = validateString(pathParam, "path", {
				minLength: 1,
				maxLength: 500,
			});
		}

		if (statusCodeParam) {
			filters.statusCode = validateNumber(statusCodeParam, "statusCode", {
				min: 100,
				max: 599,
				integer: true,
			});
		}

		if (successParam) {
			filters.success = successParam === "true";
		}

		if (dateFromParam) {
			const dateFrom = new Date(dateFromParam);
			if (!Number.isNaN(dateFrom.getTime())) {
				filters.dateFrom = dateFrom.getTime();
			}
		}

		if (dateToParam) {
			const dateTo = new Date(dateToParam);
			if (!Number.isNaN(dateTo.getTime())) {
				filters.dateTo = dateTo.getTime();
			}
		}

		if (modelParam) {
			filters.model = validateString(modelParam, "model", {
				minLength: 1,
				maxLength: 100,
			});
		}

		if (agentUsedParam) {
			filters.agentUsed = validateString(agentUsedParam, "agentUsed", {
				minLength: 1,
				maxLength: 100,
			});
		}

		try {
			// Process the query to handle camelCase and other patterns
			let ftsQuery = query;
			const isCamelCase = /[a-z][A-Z]/.test(query);

			// Escape FTS5 special characters first
			const escapedQuery = query
				.replace(/"/g, '""') // Escape quotes
				.replace(/[*()]/g, ""); // Remove special FTS chars

			if (isCamelCase) {
				// For camelCase, split it for FTS5 search
				ftsQuery = escapedQuery.replace(/([a-z])([A-Z])/g, "$1 $2");
				ftsQuery = `"${ftsQuery}"`;
			} else if (escapedQuery.includes(" ")) {
				// For multi-word queries, use phrase search
				ftsQuery = `"${escapedQuery}"`;
			} else {
				// Single word, non-camelCase
				ftsQuery = escapedQuery;
			}

			const results = dbOps.getDatabase().prepare(`
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
					fts.request_body,
					fts.response_body
				FROM request_payloads_fts fts
				JOIN requests r ON fts.id = r.id
				LEFT JOIN accounts a ON r.account_used = a.id
				WHERE request_payloads_fts MATCH ?
				${filters.accountId ? " AND r.account_used = ?" : ""}
				${filters.method ? " AND r.method = ?" : ""}
				${filters.path ? " AND r.path LIKE ?" : ""}
				${filters.statusCode ? " AND r.status_code = ?" : ""}
				${filters.success !== undefined ? " AND r.success = ?" : ""}
				${filters.dateFrom ? " AND r.timestamp >= ?" : ""}
				${filters.dateTo ? " AND r.timestamp <= ?" : ""}
				${filters.model ? " AND r.model = ?" : ""}
				${filters.agentUsed ? " AND r.agent_used = ?" : ""}
				ORDER BY r.timestamp DESC
				LIMIT ? OFFSET ?
			`);

			// Build parameters array
			const params: (string | number)[] = [ftsQuery];

			if (filters.accountId) params.push(filters.accountId);
			if (filters.method) params.push(filters.method);
			if (filters.path) params.push(`%${filters.path}%`);
			if (filters.statusCode) params.push(filters.statusCode);
			if (filters.success !== undefined) params.push(filters.success ? 1 : 0);
			if (filters.dateFrom) params.push(filters.dateFrom);
			if (filters.dateTo) params.push(filters.dateTo);
			if (filters.model) params.push(filters.model);
			if (filters.agentUsed) params.push(filters.agentUsed);

			params.push(filters.limit || 50, filters.offset || 0);

			const rawResults = results.all(...params) as Array<{
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
				request_body: string;
				response_body: string;
			}>;

			// Helper to find and extract snippets with the search term
			const findMatchingSnippets = (
				text: string,
				searchTerm: string,
				contextChars = 50,
			) => {
				if (!text) return [];

				const snippets: string[] = [];
				// Escape regex special characters in search term
				const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const searchRegex = new RegExp(escapedTerm, "gi");
				let match: RegExpExecArray | null = searchRegex.exec(text);

				while (match !== null) {
					const matchStart = match.index;
					const matchEnd = matchStart + match[0].length;

					// Find context boundaries
					let contextStart = Math.max(0, matchStart - contextChars);
					let contextEnd = Math.min(text.length, matchEnd + contextChars);

					// Adjust to word boundaries
					while (
						contextStart > 0 &&
						text[contextStart - 1] !== " " &&
						text[contextStart - 1] !== "\n"
					) {
						contextStart--;
					}
					while (
						contextEnd < text.length &&
						text[contextEnd] !== " " &&
						text[contextEnd] !== "\n"
					) {
						contextEnd++;
					}

					// Extract snippet
					let snippet = text.substring(contextStart, contextEnd);

					// Highlight the matched term
					snippet = snippet.replace(
						new RegExp(`(${escapedTerm})`, "gi"),
						"<mark>$1</mark>",
					);

					// Add ellipsis if needed
					if (contextStart > 0) snippet = `...${snippet}`;
					if (contextEnd < text.length) snippet = `${snippet}...`;

					snippets.push(snippet.trim());

					// Get next match
					match = searchRegex.exec(text);
				}

				return snippets;
			};

			// Transform results and extract all snippets
			const searchResults = rawResults
				.map((row) => {
					const requestSnippets = findMatchingSnippets(row.request_body, query);
					const responseSnippets = findMatchingSnippets(
						row.response_body,
						query,
					);

					// Only include results that actually have matches
					if (requestSnippets.length === 0 && responseSnippets.length === 0) {
						return null;
					}

					return {
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
						requestSnippets,
						responseSnippets,
					};
				})
				.filter((result) => result !== null);

			return jsonResponse({
				results: searchResults,
				total: searchResults.length,
				query: query,
				filters: filters,
			});
		} catch (error) {
			console.error("Search error:", error);
			return jsonResponse(
				{
					error: "Search failed",
					results: [],
					total: 0,
				},
				500,
			);
		}
	};
}
