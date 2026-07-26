import type { Role } from "@ccflare/types";
import React from "react";
import { useCollapsible } from "../../hooks/useCollapsible";
import { Button } from "../ui/button";
import { blockContentClass } from "./block-styles";

interface MessageBubbleProps {
	role: Role;
	content: string;
	linebreak?: boolean;
}

const MAX_CHARS_COLLAPSE = 300;

const ROLE_BG_COLORS: Record<Role, string> = {
	user: "bg-primary text-primary-foreground",
	assistant: "bg-muted",
	system: "bg-accent/10",
};

function MessageBubbleComponent({
	role,
	content,
	linebreak = false,
}: MessageBubbleProps) {
	const { display, isLong, isExpanded, toggle } = useCollapsible(
		content,
		MAX_CHARS_COLLAPSE,
	);
	const bgColor = ROLE_BG_COLORS[role];

	return (
		<div>
			<div className={`rounded-lg px-4 py-2 ${bgColor}`}>
				<div
					className={blockContentClass({
						linebreak,
						capped: isExpanded && isLong,
						extra: "text-sm text-left",
					})}
				>
					{linebreak ? content : display}
				</div>
			</div>
			{isLong && !linebreak && (
				<Button
					variant="ghost"
					size="sm"
					className="mt-1 h-6 px-2 text-xs"
					onClick={toggle}
				>
					{isExpanded ? "Show less" : "Show more"}
				</Button>
			)}
		</div>
	);
}

export const MessageBubble = React.memo(MessageBubbleComponent);
