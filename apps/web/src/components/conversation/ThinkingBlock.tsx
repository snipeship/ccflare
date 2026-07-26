import { MessageSquare } from "lucide-react";
import React from "react";
import { useCollapsible } from "../../hooks/useCollapsible";
import { Button } from "../ui/button";
import { blockContentClass } from "./block-styles";

interface ThinkingBlockProps {
	content: string;
	linebreak?: boolean;
}

const MAX_CHARS_COLLAPSE = 200;

function ThinkingBlockComponent({
	content,
	linebreak = false,
}: ThinkingBlockProps) {
	const { display, isLong, isExpanded, toggle } = useCollapsible(
		content,
		MAX_CHARS_COLLAPSE,
	);

	return (
		<div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
			<div className="flex items-center justify-between mb-1">
				<div className="flex items-center gap-2">
					<MessageSquare className="w-3 h-3 text-warning" />
					<span className="text-xs font-medium text-warning">Thinking</span>
				</div>
				{isLong && !linebreak && (
					<Button
						variant="ghost"
						size="sm"
						className="h-5 px-2 text-xs"
						onClick={toggle}
					>
						{isExpanded ? "Show less" : "Show more"}
					</Button>
				)}
			</div>
			<div
				className={blockContentClass({
					linebreak,
					extra: "text-xs text-warning",
				})}
			>
				{linebreak ? content : display}
			</div>
		</div>
	);
}

export const ThinkingBlock = React.memo(ThinkingBlockComponent);
