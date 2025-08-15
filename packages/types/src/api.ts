export interface RequestMeta {
	id: string;
	method: string;
	path: string;
	timestamp: number;
	agentUsed?: string | null;
	clientIp?: string | null;
}

export interface AgentUpdatePayload {
	description?: string;
	model?: string;
	tools?: string[];
	color?: string;
	systemPrompt?: string;
	mode?: "all" | "edit" | "read-only" | "execution" | "custom";
}
