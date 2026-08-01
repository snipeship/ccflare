export const queryKeys = {
	all: ["ccflare"] as const,
	accounts: () => [...queryKeys.all, "accounts"] as const,
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
	requestDetail: (requestId: string) =>
		[...queryKeys.all, "request-detail", { requestId }] as const,
	requestConversation: (requestId: string) =>
		[...queryKeys.all, "request-conversation", { requestId }] as const,
	logs: () => [...queryKeys.all, "logs"] as const,
	logHistory: () => [...queryKeys.all, "logs", "history"] as const,
} as const;
