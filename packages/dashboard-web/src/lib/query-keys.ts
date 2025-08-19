export const queryKeys = {
	all: ["ccflare"] as const,
	accounts: () => [...queryKeys.all, "accounts"] as const,
	agents: () => [...queryKeys.all, "agents"] as const,
	stats: () => [...queryKeys.all, "stats"] as const,
	analytics: (
		timeRange?: string,
		filters?: unknown,
		viewMode?: string,
		modelBreakdown?: boolean,
	) =>
		[
			...queryKeys.all,
			"analytics",
			{ timeRange, filters, viewMode, modelBreakdown },
		] as const,
	requests: (limit?: number) =>
		[...queryKeys.all, "requests", { limit }] as const,
	requestDetails: (id: string) =>
		[...queryKeys.all, "requests", "detail", id] as const,
	logs: () => [...queryKeys.all, "logs"] as const,
	logHistory: () => [...queryKeys.all, "logs", "history"] as const,
	defaultAgentModel: () =>
		[...queryKeys.all, "config", "defaultAgentModel"] as const,
	search: (query: string, filters?: unknown) =>
		[...queryKeys.all, "search", { query, filters }] as const,
} as const;
