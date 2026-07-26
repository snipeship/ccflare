interface BlockContentOptions {
	/** Wrap long lines and show the full block (linebreak mode). */
	linebreak?: boolean;
	/** Cap the block height with internal scrolling (expanded collapsible). */
	capped?: boolean;
	/** Additional static classes (colors, padding, etc.). */
	extra?: string;
}

/**
 * Shared class builder for conversation content blocks. Linebreak mode
 * replaces horizontal scrolling with wrapping and removes height caps.
 */
export function blockContentClass({
	linebreak,
	capped,
	extra,
}: BlockContentOptions): string {
	return [
		extra,
		linebreak
			? "whitespace-pre-wrap break-words overflow-x-hidden"
			: "whitespace-pre overflow-x-auto",
		!linebreak && capped ? "max-h-96 overflow-y-auto pr-2" : "",
	]
		.filter(Boolean)
		.join(" ");
}
