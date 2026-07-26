import { Terminal } from "lucide-react";
import React, { useMemo } from "react";
import { useCollapsible } from "../../hooks/useCollapsible";
import { Button } from "../ui/button";
import { blockContentClass } from "./block-styles";

interface ToolUsageBlockProps {
	toolName: string;
	input?: Record<string, unknown>;
	linebreak?: boolean;
}

const MAX_CHARS_COLLAPSE = 200;

function ToolUsageBlockComponent({
	toolName,
	input,
	linebreak = false,
}: ToolUsageBlockProps) {
	const inputStr = useMemo(
		() => (input ? JSON.stringify(input, null, 2) : ""),
		[input],
	);

	const { display, isLong, isExpanded, toggle } = useCollapsible(
		inputStr,
		MAX_CHARS_COLLAPSE,
	);
	const hasInput = input && Object.keys(input).length > 0;

	return (
		<div className="p-3 bg-info/10 border border-info/20 rounded-lg">
			<div className="flex items-center justify-between mb-1">
				<div className="flex items-center gap-2">
					<Terminal className="w-3 h-3 text-info" />
					<span className="text-xs font-medium text-info">
						Tool: {toolName}
					</span>
				</div>
				{hasInput && isLong && !linebreak && (
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs"
						onClick={toggle}
					>
						{isExpanded ? "Show less" : "Show more"}
					</Button>
				)}
			</div>
			{hasInput && (
				<pre
					className={blockContentClass({
						linebreak,
						capped: isExpanded && isLong,
						extra: "text-xs bg-info/10 p-2 rounded mt-1 text-left",
					})}
				>
					{linebreak ? inputStr : display}
				</pre>
			)}
		</div>
	);
}

export const ToolUsageBlock = React.memo(ToolUsageBlockComponent);
