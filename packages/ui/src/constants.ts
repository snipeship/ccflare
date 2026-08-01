export const COLORS = {
	primary: "#f38020",
	success: "#10b981",
	warning: "#f59e0b",
	error: "#ef4444",
	blue: "#3b82f6",
	purple: "#8b5cf6",
	pink: "#ec4899",
} as const;

export const CHART_COLORS = [
	COLORS.primary,
	COLORS.blue,
	COLORS.purple,
	COLORS.pink,
	COLORS.success,
] as const;

export const TIME_RANGES = {
	"1h": "Last Hour",
	"6h": "Last 6 Hours",
	"24h": "Last 24 Hours",
	"7d": "Last 7 Days",
	"30d": "Last 30 Days",
} as const;

export const CHART_HEIGHTS = {
	small: 250,
	medium: 300,
	large: 400,
} as const;

export const CHART_TOOLTIP_STYLE = {
	default: {
		backgroundColor: "var(--background)",
		border: "1px solid var(--border)",
		borderRadius: "var(--radius)",
	},
	success: {
		backgroundColor: COLORS.success,
		border: `1px solid ${COLORS.success}`,
		borderRadius: "var(--radius)",
		color: "#fff",
	},
	dark: {
		backgroundColor: "rgba(0,0,0,0.8)",
		border: "1px solid rgba(255,255,255,0.2)",
		borderRadius: "8px",
		backdropFilter: "blur(8px)",
	},
} as const;

export const CHART_PROPS = {
	strokeDasharray: "3 3",
	gridClassName: "stroke-muted",
} as const;

export const REFRESH_INTERVALS = {
	default: 30000,
	fast: 10000,
	slow: 60000,
} as const;

export const API_TIMEOUT = 30000;

export const QUERY_CONFIG = {
	staleTime: 10000,
} as const;

export const API_LIMITS = {
	requestsSummary: 50,
} as const;
