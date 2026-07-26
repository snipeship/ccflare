import { FileText } from "lucide-react";
import React from "react";
import { useCollapsible } from "../../hooks/useCollapsible";
import { Button } from "../ui/button";
import { blockContentClass } from "./block-styles";

interface ToolResultBlockProps {
	content: string;
	linebreak?: boolean;
}

const MAX_CHARS_COLLAPSE = 200;

function ToolResultBlockComponent({
	content,
	linebreak = false,
}: ToolResultBlockProps) {
	const { display, isLong, isExpanded, toggle } = useCollapsible(
		content,
		MAX_CHARS_COLLAPSE,
	);

	return (
		<div className="p-3 bg-success/10 border border-success/20 rounded-lg">
			<div className="flex items-center justify-between mb-1">
				<div className="flex items-center gap-2">
					<FileText className="w-3 h-3 text-success" />
					<span className="text-xs font-medium text-success">Tool Result</span>
				</div>
				{isLong && !linebreak && (
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
			<div className="text-xs bg-success/10 p-2 rounded mt-1 overflow-hidden">
				<pre
					className={blockContentClass({
						linebreak,
						capped: isExpanded && isLong,
						extra: "text-left",
					})}
				>
					{linebreak ? content : display}
				</pre>
			</div>
		</div>
	);
}

export const ToolResultBlock = React.memo(ToolResultBlockComponent);
