import { useMemo, useState } from "react";

export const useCollapsible = (content: string, limit: number) => {
	const [isExpanded, setIsExpanded] = useState(false);

	const isLong = useMemo(
		() => !!content && content.length > limit,
		[content, limit],
	);

	const display = useMemo(() => {
		if (isExpanded || !isLong) {
			return content;
		}
		return content ? `${content.slice(0, limit)}...` : "";
	}, [content, limit, isExpanded, isLong]);

	const toggle = () => setIsExpanded((prev) => !prev);

	return {
		display,
		isLong,
		isExpanded,
		toggle,
	};
};
