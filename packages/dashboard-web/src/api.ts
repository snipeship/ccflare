import { HttpClient, HttpError } from "@ccflare/http-common";
import type {
	AccountResponse,
	Agent,
	AgentUpdatePayload,
	AgentWorkspace,
	AnalyticsResponse,
	LogEvent,
	RequestPayload,
	RequestResponse,
	StatsWithAccounts,
} from "@ccflare/types";
import { API_LIMITS, API_TIMEOUT } from "./constants";

// Re-export types with dashboard-specific aliases for backward compatibility
export type Account = AccountResponse;
export type Stats = StatsWithAccounts;
export type LogEntry = LogEvent;
export type RequestSummary = RequestResponse;

// Re-export types directly
export type {
	Agent,
	AgentWorkspace,
	RequestPayload,
	RequestResponse,
} from "@ccflare/types";

// Agent response interface
export interface AgentsResponse {
	agents: Agent[];
	globalAgents: Agent[];
	workspaceAgents: Agent[];
	workspaces: AgentWorkspace[];
}

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

	// Override request to include credentials
	async request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
		return super.request<T>(url, {
			...options,
			credentials: "include",
		});
	}

	async getStats(): Promise<Stats> {
		return this.get<Stats>("/api/stats");
	}

	async getAccounts(): Promise<Account[]> {
		return this.get<Account[]>("/api/accounts");
	}

	async initAddAccount(data: {
		name: string;
		mode: "max" | "console";
		tier: number;
	}): Promise<{ authUrl: string; sessionId: string }> {
		try {
			return await this.post<{ authUrl: string; sessionId: string }>(
				"/api/oauth/init",
				data,
			);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async completeAddAccount(data: {
		sessionId: string;
		code: string;
	}): Promise<{ message: string; mode: string; tier: number }> {
		try {
			return await this.post<{ message: string; mode: string; tier: number }>(
				"/api/oauth/callback",
				data,
			);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async removeAccount(name: string, confirm: string): Promise<void> {
		try {
			await this.delete(`/api/accounts/${name}`, {
				body: JSON.stringify({ confirm }),
			});
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async resetStats(): Promise<void> {
		await this.post("/api/stats/reset");
	}

	async getLogHistory(): Promise<LogEntry[]> {
		return this.get<LogEntry[]>("/api/logs/history");
	}

	// SSE streaming requires special handling, keep as-is
	streamLogs(onLog: (log: LogEntry) => void): EventSource {
		const eventSource = new EventSource(`/api/logs/stream`);
		eventSource.addEventListener("message", (event) => {
			try {
				const data = JSON.parse(event.data);
				// Skip non-log messages (like the initial "connected" message)
				if (data.ts && data.level && data.msg) {
					onLog(data as LogEntry);
				}
			} catch (e) {
				console.error("Error parsing log event:", e);
			}
		});
		return eventSource;
	}

	async getRequestsDetail(
		limit: number = API_LIMITS.requestsDetail,
	): Promise<RequestPayload[]> {
		return this.get<RequestPayload[]>(`/api/requests/detail?limit=${limit}`);
	}

	async getRequestsSummary(
		limit: number = API_LIMITS.requestsSummary,
	): Promise<RequestSummary[]> {
		return this.get<RequestSummary[]>(`/api/requests?limit=${limit}`);
	}

	async getAnalytics(
		range = "24h",
		filters?: {
			accounts?: string[];
			models?: string[];
			status?: "all" | "success" | "error";
		},
		mode: "normal" | "cumulative" = "normal",
		modelBreakdown?: boolean,
	): Promise<AnalyticsResponse> {
		const params = new URLSearchParams({ range });

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

		return this.get<AnalyticsResponse>(`/api/analytics?${params}`);
	}

	async pauseAccount(accountId: string): Promise<void> {
		try {
			await this.post(`/api/accounts/${accountId}/pause`);
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async resumeAccount(accountId: string): Promise<void> {
		try {
			await this.post(`/api/accounts/${accountId}/resume`);
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
			const response = await this.post<{
				success: boolean;
				message: string;
				newName: string;
			}>(`/api/accounts/${accountId}/rename`, { name: newName });
			return { newName: response.newName };
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getStrategy(): Promise<string> {
		const data = await this.get<{ strategy: string }>("/api/config/strategy");
		return data.strategy;
	}

	async listStrategies(): Promise<string[]> {
		return this.get<string[]>("/api/strategies");
	}

	async setStrategy(strategy: string): Promise<void> {
		try {
			await this.post("/api/config/strategy", { strategy });
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getAgents(): Promise<AgentsResponse> {
		return await this.get<AgentsResponse>("/api/agents");
	}

	async updateAgentPreference(agentId: string, model: string): Promise<void> {
		try {
			await this.post(`/api/agents/${agentId}/preference`, { model });
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async updateAgent(
		agentId: string,
		payload: AgentUpdatePayload,
	): Promise<Agent> {
		try {
			const response = await this.patch<{ success: boolean; agent: Agent }>(
				`/api/agents/${agentId}`,
				payload,
			);
			return response.agent;
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async getDefaultAgentModel(): Promise<string> {
		const data = await this.get<{ model: string }>("/api/config/model");
		return data.model;
	}

	async setDefaultAgentModel(model: string): Promise<void> {
		try {
			await this.post("/api/config/model", { model });
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async setBulkAgentPreferences(
		model: string,
	): Promise<{ updatedCount: number }> {
		try {
			const response = await this.post<{
				success: boolean;
				updatedCount: number;
				model: string;
			}>("/api/agents/bulk-preference", { model });
			return { updatedCount: response.updatedCount };
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	async updateAccountsPriorities(
		accountPriorities: Array<{ id: string; priority: number }>,
	): Promise<void> {
		try {
			await this.post("/api/accounts/priorities", { accountPriorities });
		} catch (error) {
			if (error instanceof HttpError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}
}

export const api = new API();
