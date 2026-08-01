import { describe, expect, it } from "bun:test";
import type { RequestSummary } from "@ccflare/types";
import { createCompletionMessages } from "./worker-messages";

describe("completion worker messages", () => {
	it("returns only a summary message to the main thread", () => {
		const summary = { id: "request-1" } as RequestSummary;

		expect(createCompletionMessages(summary)).toEqual([
			{ type: "summary", summary },
		]);
	});
});
