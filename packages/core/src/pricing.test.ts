import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { estimateCostUSD, resetPricingCatalogue } from "./pricing";

const originalFetch = globalThis.fetch;

function stubCatalogue(catalogue: unknown): void {
	globalThis.fetch = Object.assign(
		async () =>
			new Response(JSON.stringify(catalogue), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		{ preconnect: originalFetch.preconnect },
	) as typeof fetch;
}

beforeEach(() => {
	resetPricingCatalogue();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetPricingCatalogue();
});

describe("estimateCostUSD", () => {
	it("applies cache_read pricing for cached OpenAI input tokens", async () => {
		globalThis.fetch = Object.assign(
			async () =>
				new Response(
					JSON.stringify({
						openai: {
							models: {
								"gpt-4o": {
									id: "gpt-4o",
									name: "GPT-4o",
									cost: {
										input: 2.5,
										output: 10,
										cache_read: 1.25,
									},
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		await expect(
			estimateCostUSD("gpt-4o", {
				inputTokens: 127,
				cacheReadInputTokens: 18_688,
				outputTokens: 431,
			}),
		).resolves.toBeCloseTo(
			(127 * 2.5 + 18_688 * 1.25 + 431 * 10) / 1_000_000,
			10,
		);
	});

	it("prices Kimi subscription model ids at their metered Moonshot rates", async () => {
		stubCatalogue({
			"kimi-for-coding": {
				models: {
					k3: {
						id: "k3",
						name: "Kimi K3",
						cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
					},
				},
			},
			moonshotai: {
				models: {
					"kimi-k3": {
						id: "kimi-k3",
						name: "Kimi K3",
						cost: { input: 3, output: 15, cache_read: 0.3 },
					},
				},
			},
		});

		await expect(
			estimateCostUSD(
				"k3",
				{ inputTokens: 1_000, cacheReadInputTokens: 4_000, outputTokens: 200 },
				{ provider: "kimi" },
			),
		).resolves.toBeCloseTo(
			(1_000 * 3 + 4_000 * 0.3 + 200 * 15) / 1_000_000,
			10,
		);
	});

	it("prefers the first-party catalogue block when resellers list the same id", async () => {
		stubCatalogue({
			reseller: {
				models: {
					"gpt-5.3-codex": {
						id: "gpt-5.3-codex",
						name: "Reseller markup",
						cost: { input: 99, output: 99 },
					},
				},
			},
			openai: {
				models: {
					"gpt-5.3-codex": {
						id: "gpt-5.3-codex",
						name: "GPT-5.3 Codex",
						cost: { input: 1.75, output: 14, cache_read: 0.175 },
					},
				},
			},
		});

		await expect(
			estimateCostUSD(
				"gpt-5.3-codex",
				{ inputTokens: 1_000, outputTokens: 100 },
				{ provider: "codex" },
			),
		).resolves.toBeCloseTo((1_000 * 1.75 + 100 * 14) / 1_000_000, 10);
	});

	it("falls back to a catalogue-wide scan without a provider hint", async () => {
		stubCatalogue({
			moonshotai: {
				models: {
					"kimi-k3": {
						id: "kimi-k3",
						name: "Kimi K3",
						cost: { input: 3, output: 15 },
					},
				},
			},
		});

		await expect(
			estimateCostUSD("kimi-k3", { inputTokens: 1_000, outputTokens: 100 }),
		).resolves.toBeCloseTo((1_000 * 3 + 100 * 15) / 1_000_000, 10);
	});
});
