import { describe, expect, it } from "bun:test";
import { resolveCopyValue } from "./CopyButton";

describe("resolveCopyValue", () => {
	it("supports async producers and suppresses duplicate resolutions", async () => {
		const lock = { current: false };
		let release: ((value: string) => void) | undefined;
		const produced = new Promise<string>((resolve) => {
			release = resolve;
		});
		const writes: string[] = [];
		const first = resolveCopyValue(
			lock,
			() => produced,
			async (text) => {
				writes.push(text);
			},
		);
		const duplicate = await resolveCopyValue(
			lock,
			() => "duplicate",
			async (text) => {
				writes.push(text);
			},
		);

		expect(duplicate).toBe(false);
		release?.("resolved");
		expect(await first).toBe(true);
		expect(writes).toEqual(["resolved"]);
	});

	it("releases the lock after producer errors", async () => {
		const lock = { current: false };
		await expect(
			resolveCopyValue(
				lock,
				async () => {
					throw new Error("detail failed");
				},
				async () => {},
			),
		).rejects.toThrow("detail failed");
		expect(lock.current).toBe(false);
	});
});
