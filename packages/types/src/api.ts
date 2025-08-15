export interface RequestMeta {
	id: string;
	method: string;
	path: string;
	timestamp: number;
	agentUsed?: string | null;
}

export interface AgentUpdatePayload {
	description?: string;
	model?: string;
	tools?: string[];
	color?: string;
	systemPrompt?: string;
	mode?: "all" | "edit" | "read-only" | "execution" | "custom";
}

/**
 * Search response with pagination metadata
 */
export interface SearchResponse<T = unknown> {
	results: T[];
	total: number;
	page: number;
	pageSize: number;
	hasNext: boolean;
	hasPrev: boolean;
}
