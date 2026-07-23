import type {
	AccountProvider,
	AnalyticsResponse,
	AnalyticsStatusFilter,
	ModelPerformance,
	TimePoint,
	TokenBreakdown,
} from "@ccflare/types";
import { NO_ACCOUNT_ID } from "@ccflare/types";
import { BaseRepository } from "./base.repository";

export interface AnalyticsQueryOptions {
	startMs: number;
	bucketMs: number;
	accounts?: string[];
	models?: string[];
	providers?: AccountProvider[];
	status?: AnalyticsStatusFilter;
	includeModelBreakdown?: boolean;
}

interface CombinedTotalsResult {
	total_requests: number;
	success_rate: number | null;
	avg_response_time: number | null;
	total_tokens: number | null;
	total_cost_usd: number | null;
	avg_tokens_per_second: number | null;
	active_accounts: number;
	input_tokens: number | null;
	cache_read_input_tokens: number | null;
	cache_creation_input_tokens: number | null;
	output_tokens: number | null;
}

interface QueryFilters {
	whereClause: string;
	queryParams: Array<string | number>;
}

export class AnalyticsRepository extends BaseRepository<never> {
	getAnalytics(options: AnalyticsQueryOptions): AnalyticsResponse {
		const includeModelBreakdown = options.includeModelBreakdown === true;
		const { whereClause, queryParams } = this.buildFilters(options);

		// Combined totals, active accounts, and token breakdown in one pass
		const combined = this.get<CombinedTotalsResult>(
			`
				SELECT
					COUNT(*) as total_requests,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 /
						NULLIF(SUM(CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END), 0) as success_rate,
					AVG(response_time_ms) as avg_response_time,
					SUM(COALESCE(total_tokens, 0)) as total_tokens,
					SUM(COALESCE(cost_usd, 0)) as total_cost_usd,
					AVG(output_tokens_per_second) as avg_tokens_per_second,
					COUNT(DISTINCT COALESCE(account_used, ?)) as active_accounts,
					SUM(COALESCE(input_tokens, 0)) as input_tokens,
					SUM(COALESCE(cache_read_input_tokens, 0)) as cache_read_input_tokens,
					SUM(COALESCE(cache_creation_input_tokens, 0)) as cache_creation_input_tokens,
					SUM(COALESCE(output_tokens, 0)) as output_tokens
				FROM requests r
				WHERE ${whereClause}
			`,
			[NO_ACCOUNT_ID, ...queryParams],
		);

		const timeSeries = this.query<{
			ts: number;
			model?: string;
			requests: number;
			tokens: number | null;
			cost_usd: number | null;
			success_rate: number | null;
			error_rate: number | null;
			cache_hit_rate: number | null;
			avg_response_time: number | null;
			avg_tokens_per_second: number | null;
		}>(
			`
				SELECT
					(timestamp / ?) * ? as ts,
					${includeModelBreakdown ? "model," : ""}
					COUNT(*) as requests,
					SUM(COALESCE(total_tokens, 0)) as tokens,
					SUM(COALESCE(cost_usd, 0)) as cost_usd,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 /
						NULLIF(SUM(CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END), 0) as success_rate,
					SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 /
						NULLIF(SUM(CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END), 0) as error_rate,
					SUM(COALESCE(cache_read_input_tokens, 0)) * 100.0 /
						NULLIF(SUM(COALESCE(input_tokens, 0) + COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_creation_input_tokens, 0)), 0) as cache_hit_rate,
					AVG(response_time_ms) as avg_response_time,
					AVG(output_tokens_per_second) as avg_tokens_per_second
				FROM requests r
				WHERE ${whereClause} ${includeModelBreakdown ? "AND model IS NOT NULL" : ""}
				GROUP BY ts${includeModelBreakdown ? ", model" : ""}
				ORDER BY ts${includeModelBreakdown ? ", model" : ""}
			`,
			[options.bucketMs, options.bucketMs, ...queryParams],
		);

		const modelDistribution = this.query<{ model: string; count: number }>(
			`
				SELECT
					model,
					COUNT(*) as count
				FROM requests r
				WHERE ${whereClause} AND model IS NOT NULL
				GROUP BY model
				ORDER BY count DESC
				LIMIT 10
			`,
			queryParams,
		);

		const accountPerformance = this.query<{
			name: string;
			requests: number;
			success_rate: number | null;
		}>(
			`
				SELECT
					COALESCE(a.name, ?) as name,
					COUNT(r.id) as requests,
					SUM(CASE WHEN r.success = 1 THEN 1 ELSE 0 END) * 100.0 /
						NULLIF(SUM(CASE WHEN r.success IS NOT NULL THEN 1 ELSE 0 END), 0) as success_rate
				FROM requests r
				LEFT JOIN accounts a ON a.id = r.account_used
				WHERE ${whereClause}
				GROUP BY name
				HAVING requests > 0
				ORDER BY requests DESC
			`,
			[NO_ACCOUNT_ID, ...queryParams],
		);

		const providerBreakdown = this.query<{
			provider: AccountProvider;
			requests: number;
			success_rate: number | null;
			total_tokens: number | null;
			total_cost_usd: number | null;
		}>(
			`
				SELECT
					r.provider as provider,
					COUNT(*) as requests,
					SUM(CASE WHEN r.success = 1 THEN 1 ELSE 0 END) * 100.0 /
						NULLIF(SUM(CASE WHEN r.success IS NOT NULL THEN 1 ELSE 0 END), 0) as success_rate,
					SUM(COALESCE(r.total_tokens, 0)) as total_tokens,
					SUM(COALESCE(r.cost_usd, 0)) as total_cost_usd
				FROM requests r
				WHERE ${whereClause}
				GROUP BY r.provider
				ORDER BY requests DESC
			`,
			queryParams,
		).map((row) => ({
			provider: row.provider,
			requests: row.requests,
			successRate: row.success_rate ?? 0,
			totalTokens: row.total_tokens ?? 0,
			totalCostUsd: row.total_cost_usd ?? 0,
		}));

		// Model performance + p95 in one query (eliminates N+1 p95 loop)
		const modelPerformance: ModelPerformance[] = this.query<{
			model: string;
			avg_response_time: number | null;
			p95_response_time: number | null;
			total_requests: number;
			error_rate: number | null;
			avg_tokens_per_second: number | null;
			min_tokens_per_second: number | null;
			max_tokens_per_second: number | null;
		}>(
			`
				WITH model_stats AS (
					SELECT
						model,
						AVG(response_time_ms) as avg_response_time,
						COUNT(*) as total_requests,
						SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 /
							NULLIF(SUM(CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END), 0) as error_rate,
						AVG(output_tokens_per_second) as avg_tokens_per_second,
						MIN(CASE WHEN output_tokens_per_second > 0 THEN output_tokens_per_second ELSE NULL END) as min_tokens_per_second,
						MAX(output_tokens_per_second) as max_tokens_per_second
					FROM requests r
					WHERE ${whereClause} AND model IS NOT NULL
					GROUP BY model
					ORDER BY total_requests DESC
					LIMIT 10
				),
				ranked_times AS (
					SELECT
						r.model,
						r.response_time_ms,
						ROW_NUMBER() OVER (PARTITION BY r.model ORDER BY r.response_time_ms) as row_num,
						COUNT(*) OVER (PARTITION BY r.model) as total_count
					FROM requests r
					INNER JOIN model_stats ms ON ms.model = r.model
					WHERE ${whereClause} AND r.response_time_ms IS NOT NULL
				)
				SELECT
					ms.*,
					rt.response_time_ms as p95_response_time
				FROM model_stats ms
				LEFT JOIN ranked_times rt
					ON rt.model = ms.model
					-- p95 rank = ceil(total_count * 0.95). CEIL()/FLOOR() are not builtin SQLite
					-- functions unless compiled with SQLITE_ENABLE_MATH_FUNCTIONS (not available in
					-- bun:sqlite), so ceil(x) for non-negative x is computed portably as
					-- trunc(x) + (x > trunc(x)) — CAST(x AS INTEGER) truncates toward zero, which
					-- equals floor(x) for any x >= 0 (total_count is always a positive COUNT(*), so
					-- this is always non-negative).
					AND rt.row_num = (
						CAST(rt.total_count * 0.95 AS INTEGER) +
						(rt.total_count * 0.95 > CAST(rt.total_count * 0.95 AS INTEGER))
					)
				ORDER BY ms.total_requests DESC
			`,
			[...queryParams, ...queryParams],
		).map((row) => ({
			model: row.model,
			avgResponseTime: row.avg_response_time ?? 0,
			p95ResponseTime: row.p95_response_time ?? row.avg_response_time ?? 0,
			errorRate: row.error_rate ?? 0,
			avgTokensPerSecond: row.avg_tokens_per_second ?? null,
			minTokensPerSecond: row.min_tokens_per_second ?? null,
			maxTokensPerSecond: row.max_tokens_per_second ?? null,
		}));

		const costByModel = this.query<{
			model: string;
			cost_usd: number | null;
			requests: number;
			total_tokens: number | null;
		}>(
			`
				SELECT
					model,
					SUM(COALESCE(cost_usd, 0)) as cost_usd,
					COUNT(*) as requests,
					SUM(COALESCE(total_tokens, 0)) as total_tokens
				FROM requests r
				WHERE ${whereClause} AND COALESCE(cost_usd, 0) > 0 AND model IS NOT NULL
				GROUP BY model
				ORDER BY cost_usd DESC
				LIMIT 10
			`,
			queryParams,
		).map((row) => ({
			model: row.model,
			costUsd: row.cost_usd ?? 0,
			requests: row.requests,
			totalTokens: row.total_tokens ?? 0,
		}));

		return {
			totals: {
				requests: combined?.total_requests ?? 0,
				successRate: combined?.success_rate ?? 0,
				activeAccounts: combined?.active_accounts ?? 0,
				avgResponseTime: combined?.avg_response_time ?? 0,
				totalTokens: combined?.total_tokens ?? 0,
				totalCostUsd: combined?.total_cost_usd ?? 0,
				avgTokensPerSecond: combined?.avg_tokens_per_second ?? null,
			},
			timeSeries: timeSeries.map<TimePoint>((point) => ({
				ts: point.ts,
				...(point.model ? { model: point.model } : {}),
				requests: point.requests,
				tokens: point.tokens ?? 0,
				costUsd: point.cost_usd ?? 0,
				successRate: point.success_rate ?? 0,
				errorRate: point.error_rate ?? 0,
				cacheHitRate: point.cache_hit_rate ?? 0,
				avgResponseTime: point.avg_response_time ?? 0,
				avgTokensPerSecond: point.avg_tokens_per_second ?? null,
			})),
			tokenBreakdown: {
				inputTokens: combined?.input_tokens ?? 0,
				cacheReadInputTokens: combined?.cache_read_input_tokens ?? 0,
				cacheCreationInputTokens: combined?.cache_creation_input_tokens ?? 0,
				outputTokens: combined?.output_tokens ?? 0,
			} satisfies TokenBreakdown,
			modelDistribution,
			accountPerformance: accountPerformance.map((account) => ({
				name: account.name,
				requests: account.requests,
				successRate: account.success_rate ?? 0,
			})),
			providerBreakdown,
			costByModel,
			modelPerformance,
		};
	}

	private buildFilters(options: AnalyticsQueryOptions): QueryFilters {
		const conditions: string[] = ["timestamp > ?"];
		const queryParams: Array<string | number> = [options.startMs];
		const accounts = options.accounts ?? [];
		const models = options.models ?? [];
		const providers = options.providers ?? [];
		const status = options.status ?? "all";

		if (accounts.length > 0) {
			const placeholders = accounts.map(() => "?").join(",");
			conditions.push(`(
				r.account_used IN (SELECT id FROM accounts WHERE name IN (${placeholders}))
				OR (r.account_used = ? AND ? IN (${placeholders}))
			)`);
			queryParams.push(...accounts, NO_ACCOUNT_ID, NO_ACCOUNT_ID, ...accounts);
		}

		if (models.length > 0) {
			const placeholders = models.map(() => "?").join(",");
			conditions.push(`model IN (${placeholders})`);
			queryParams.push(...models);
		}

		if (providers.length > 0) {
			const placeholders = providers.map(() => "?").join(",");
			conditions.push(`r.provider IN (${placeholders})`);
			queryParams.push(...providers);
		}

		if (status === "success") {
			conditions.push("success = 1");
		} else if (status === "error") {
			conditions.push("success = 0");
		}

		return {
			whereClause: conditions.join(" AND "),
			queryParams,
		};
	}
}
