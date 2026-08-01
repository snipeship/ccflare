import type { AccountResponse } from "@ccflare/api";
import { HttpClient, HttpError } from "@ccflare/http";
import type {
	AccountCreateData,
	AccountProvider,
	AnalyticsResponse,
	ApiKeyProvider,
	AuthCompleteData,
	AuthInitData,
	AuthSessionStatusResponse,
	CleanupResponse,
	LogEvent,
	MutationResult,
	OAuthProvider,
	RequestPayload,
	RequestSummary,
	RetentionGetResponse,
	RetentionSetRequest,
	StatsWithAccounts,
	StrategyName,
	StrategyResponse,
	TimeRange,
} from "@ccflare/types";
import { isLogEvent, parseLogStreamEvent } from "@ccflare/types";
import { API_LIMITS, API_TIMEOUT } from "./constants";

class API extends HttpClient {
	constructor() {
		super({
			baseUrl: "",
			defaultHeaders: {
				"Content-Type": "application/json",
			},
			timeout: API_TIMEOUT,
			retries: 1,
		});
	}

	async getStats(): Promise<StatsWithAccounts> {
		return this.getJson<StatsWithAccounts>("/api/stats");
	}

	async getAccounts(): Promise<AccountResponse[]> {
		return this.getJson<AccountResponse[]>("/api/accounts");
	}

	async createApiKeyAccount(data: {
		name: string;
		provider: ApiKeyProvider;
		apiKey: string;
	}): Promise<{ message: string; accountId: string }> {
		try {
			const result = await this.postJson<MutationResult<AccountCreateData>>(
				"/api/accounts",
				{
					name: data.name,
					provider: data.provider,
					auth_method: "api_key",
					api_key: data.apiKey,
				},
			);
			return {
				message: result.message,
				accountId: result.data?.accountId ?? "",
			};
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async initAddAccount(data: {
		name: string;
		provider: OAuthProvider;
	}): Promise<{ authUrl: string; sessionId: string }> {
		try {
			const result = await this.postJson<MutationResult<AuthInitData>>(
				`/api/auth/${data.provider}/init`,
				data,
			);
			return {
				authUrl: result.data?.authUrl ?? "",
				sessionId: result.data?.sessionId ?? "",
			};
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async completeAddAccount(data: {
		provider: OAuthProvider;
		sessionId: string;
		code: string;
	}): Promise<{ message: string; provider: OAuthProvider }> {
		try {
			const result = await this.postJson<MutationResult<AuthCompleteData>>(
				`/api/auth/${data.provider}/complete`,
				data,
			);
			return {
				message: result.message,
				provider: result.data?.provider ?? data.provider,
			};
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getAuthSessionStatus(
		sessionId: string,
	): Promise<AuthSessionStatusResponse> {
		try {
			return await this.getJson<AuthSessionStatusResponse>(
				`/api/auth/session/${sessionId}/status`,
			);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async removeAccount(id: string): Promise<void> {
		try {
			await this.deleteJson(`/api/accounts/${id}`);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async resetStats(): Promise<void> {
		await this.postJson("/api/stats/reset");
	}

	async getLogHistory(): Promise<LogEvent[]> {
		return this.getJson<LogEvent[]>("/api/logs/history");
	}

	// SSE streaming requires special handling, keep as-is
	streamLogs(onLog: (log: LogEvent) => void): EventSource {
		const eventSource = new EventSource(`/api/logs/stream`);
		eventSource.addEventListener("message", (event) => {
			try {
				const data = parseLogStreamEvent(JSON.parse(event.data));
				if (data && isLogEvent(data)) {
					onLog(data);
				}
			} catch (e) {
				console.error("Error parsing log event:", e);
			}
		});
		return eventSource;
	}

	async getRequestDetail(requestId: string): Promise<RequestPayload> {
		return this.getJson<RequestPayload>(
			`/api/requests/${encodeURIComponent(requestId)}/detail`,
		);
	}

	async getRequestsSummary(
		limit: number = API_LIMITS.requestsSummary,
	): Promise<RequestSummary[]> {
		return this.getJson<RequestSummary[]>(`/api/requests?limit=${limit}`);
	}

	async getRequestConversation(requestId: string): Promise<RequestPayload[]> {
		return this.getJson<RequestPayload[]>(
			`/api/requests/${encodeURIComponent(requestId)}/conversation`,
		);
	}

	async getAnalytics(
		range: TimeRange = "24h",
		filters?: {
			providers?: AccountProvider[];
			accounts?: string[];
			models?: string[];
			status?: "all" | "success" | "error";
		},
		mode: "normal" | "cumulative" = "normal",
		modelBreakdown?: boolean,
	): Promise<AnalyticsResponse> {
		const params = new URLSearchParams({ range });

		if (filters?.providers?.length) {
			params.append("providers", filters.providers.join(","));
		}
		if (filters?.accounts?.length) {
			params.append("accounts", filters.accounts.join(","));
		}
		if (filters?.models?.length) {
			params.append("models", filters.models.join(","));
		}
		if (filters?.status && filters.status !== "all") {
			params.append("status", filters.status);
		}
		if (mode === "cumulative") {
			params.append("mode", "cumulative");
		}
		if (modelBreakdown) {
			params.append("modelBreakdown", "true");
		}

		return this.getJson<AnalyticsResponse>(`/api/analytics?${params}`);
	}

	async pauseAccount(accountId: string): Promise<void> {
		try {
			await this.postJson(`/api/accounts/${accountId}/pause`);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async resumeAccount(accountId: string): Promise<void> {
		try {
			await this.postJson(`/api/accounts/${accountId}/resume`);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async renameAccount(
		accountId: string,
		newName: string,
	): Promise<{ newName: string }> {
		try {
			const result = await this.postJson<MutationResult<{ newName: string }>>(
				`/api/accounts/${accountId}/rename`,
				{ name: newName },
			);
			return { newName: result.data?.newName ?? newName };
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getStrategy(): Promise<StrategyName> {
		const data = await this.getJson<StrategyResponse>("/api/config/strategy");
		return data.strategy;
	}

	async listStrategies(): Promise<StrategyName[]> {
		return this.getJson<StrategyName[]>("/api/strategies");
	}

	async setStrategy(strategy: StrategyName): Promise<void> {
		try {
			await this.postJson<MutationResult<StrategyResponse>>(
				"/api/config/strategy",
				{ strategy },
			);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getRetention(): Promise<RetentionGetResponse> {
		return this.getJson<RetentionGetResponse>("/api/config/retention");
	}

	async setRetention(partial: RetentionSetRequest): Promise<void> {
		await this.postJson("/api/config/retention", partial);
	}

	async cleanupNow(): Promise<CleanupResponse> {
		const result = await this.postJson<MutationResult<CleanupResponse>>(
			"/api/maintenance/cleanup",
		);
		return (
			result.data ?? { removedRequests: 0, removedPayloads: 0, cutoffIso: "" }
		);
	}

	async compactDb(): Promise<void> {
		await this.postJson("/api/maintenance/compact");
	}
}

export const api = new API();
