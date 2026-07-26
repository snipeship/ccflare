import {
	type ContentBlock,
	ContentBlockType,
	type Role,
	type ToolResult,
	type ToolUse,
} from "@ccflare/types";
import type { LucideIcon } from "lucide-react";
import { Bot, FileText, Terminal, User } from "lucide-react";
import React from "react";
import { Badge } from "../ui/badge";
import { MessageBubble } from "./MessageBubble";
import { SystemEventBlock } from "./SystemEventBlock";
import { parseSystemEventNotices } from "./system-events";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolResultBlock } from "./ToolResultBlock";
import { ToolUsageBlock } from "./ToolUsageBlock";

interface MessageProps {
	role: Role;
	content: string;
	contentBlocks?: ContentBlock[];
	tools?: ToolUse[];
	toolResults?: ToolResult[];
	cleanLineNumbers: (content: string) => string;
	linebreak?: boolean;
}

const ROLE_STYLES: Record<Role, { bg: string; Icon: LucideIcon }> = {
	user: { bg: "bg-primary text-primary-foreground", Icon: User },
	assistant: { bg: "bg-muted", Icon: Bot },
	system: { bg: "bg-accent/10", Icon: Bot },
};

function MessageComponent({
	role,
	content,
	contentBlocks,
	tools,
	toolResults,
	cleanLineNumbers,
	linebreak = false,
}: MessageProps) {
	const isRightAligned = role === "user";
	const thinkingBlock = contentBlocks?.find(
		(b) => b.type === ContentBlockType.Thinking,
	);
	const thinkingText =
		typeof thinkingBlock?.thinking === "string" ? thinkingBlock.thinking : "";
	const hasThinking =
		thinkingText && cleanLineNumbers(thinkingText).trim().length > 0;
	const cleanedContent =
		typeof content === "string" ? cleanLineNumbers(content).trim() : "";
	const { notices: systemNotices, remainingContent } =
		role === "system"
			? parseSystemEventNotices(cleanedContent)
			: { notices: [], remainingContent: cleanedContent };
	const displayContent = role === "system" ? remainingContent : cleanedContent;
	const hasTools = tools?.length || 0;
	const hasToolResults = toolResults?.length || 0;

	const roleStyle = ROLE_STYLES[role] ?? ROLE_STYLES.assistant;
	const Icon = roleStyle.Icon;
	const roleLabel =
		typeof role === "string" && role.length > 0 ? role : "assistant";

	return (
		<div
			className={`flex gap-3 w-full ${isRightAligned ? "flex-row-reverse" : "flex-row"}`}
		>
			<div
				className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${roleStyle.bg}`}
			>
				<Icon className="w-4 h-4" />
			</div>

			<div
				className={`flex-1 min-w-0 ${isRightAligned ? "text-right" : "text-left"}`}
			>
				<div
					className={`inline-block max-w-[85%] ${isRightAligned ? "ml-auto" : "mr-auto"}`}
				>
					<div className="flex items-center gap-2 mb-1">
						<span className="text-xs font-medium text-muted-foreground">
							{roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}
						</span>
						{hasThinking && (
							<Badge variant="secondary" className="text-xs">
								Thinking
							</Badge>
						)}
						{hasTools > 0 && (
							<Badge variant="outline" className="text-xs">
								<Terminal className="w-3 h-3 mr-1" />
								{hasTools} tool{hasTools > 1 ? "s" : ""} used
							</Badge>
						)}
						{hasToolResults > 0 && (
							<Badge variant="secondary" className="text-xs">
								<FileText className="w-3 h-3 mr-1" />
								{hasToolResults} result{hasToolResults > 1 ? "s" : ""}
							</Badge>
						)}
					</div>

					{/* Thinking block */}
					{hasThinking && thinkingBlock && (
						<div className="mb-2">
							<ThinkingBlock
								content={cleanLineNumbers(thinkingText)}
								linebreak={linebreak}
							/>
						</div>
					)}

					{/* Main content */}
					{systemNotices.length > 0 && (
						<div className="mt-2 space-y-2">
							{systemNotices.map((notice) => (
								<SystemEventBlock
									key={`${notice.kind}-${notice.title}-${notice.detail}`}
									notice={notice}
								/>
							))}
						</div>
					)}

					{displayContent.length > 0 && (
						<MessageBubble
							role={role}
							content={displayContent}
							linebreak={linebreak}
						/>
					)}

					{/* Tool usage */}
					{hasTools > 0 && (
						<div className="mt-2 space-y-2">
							{tools?.map((tool) => (
								<ToolUsageBlock
									key={`tool-${tool.id || `${tool.name}-${JSON.stringify(tool.input)}`}`}
									toolName={tool.name}
									input={tool.input}
									linebreak={linebreak}
								/>
							))}
						</div>
					)}

					{/* Tool results */}
					{hasToolResults > 0 && (
						<div className="mt-2 space-y-2">
							{toolResults?.map((result, index) => (
								<ToolResultBlock
									linebreak={linebreak}
									key={`result-${result.tool_use_id || index}`}
									content={
										typeof result.content === "string"
											? cleanLineNumbers(result.content)
											: ""
									}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export const Message = React.memo(MessageComponent);
