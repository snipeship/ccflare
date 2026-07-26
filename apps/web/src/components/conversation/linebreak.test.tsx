import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Message } from "./Message";

const longContent = `word\n${"x".repeat(400)}`;

function renderMessage(linebreak?: boolean) {
	return renderToStaticMarkup(
		// biome-ignore lint/a11y/useValidAriaRole: "role" is a chat message role, not ARIA
		<Message
			role="assistant"
			content={longContent}
			contentBlocks={[]}
			tools={[]}
			toolResults={[]}
			cleanLineNumbers={(value: string) => value}
			linebreak={linebreak}
		/>,
	);
}

describe("linebreak mode", () => {
	it("wraps and fully expands content blocks when enabled", () => {
		const html = renderMessage(true);

		expect(html).toContain("whitespace-pre-wrap");
		expect(html).toContain("break-words");
		expect(html).not.toContain("Show more");
		expect(html).toContain("x".repeat(400));
	});

	it("keeps collapsible no-wrap rendering by default", () => {
		const html = renderMessage();

		expect(html).toContain("whitespace-pre");
		expect(html).not.toContain("whitespace-pre-wrap");
		expect(html).toContain("Show more");
		expect(html).not.toContain("x".repeat(400));
	});
});
