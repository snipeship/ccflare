import { describe, expect, it } from "bun:test";
import { providerRegistry, resolveProvider } from "./index";

describe("built-in providers", () => {
	it("registers providers in the expected order", () => {
		expect(providerRegistry.listProviders()).toEqual([
			"anthropic",
			"openai",
			"claude-code",
			"codex",
			"kimi",
		]);
	});

	it("registers claude-code and resolves /v1/claude-code routes", () => {
		const provider = providerRegistry.getProvider("claude-code");
		if (!provider) {
			throw new Error("claude-code provider was not registered");
		}

		expect(providerRegistry.listProviders()).toContain("claude-code");
		expect(resolveProvider("/v1/claude-code/v1/messages")).toEqual({
			provider,
			upstreamPath: "/v1/messages",
			query: "",
		});
	});

	it("registers codex and resolves /v1/codex routes", () => {
		const provider = providerRegistry.getProvider("codex");
		if (!provider) {
			throw new Error("codex provider was not registered");
		}

		expect(providerRegistry.listProviders()).toContain("codex");
		expect(resolveProvider("/v1/codex/responses")).toEqual({
			provider,
			upstreamPath: "/responses",
			query: "",
		});
	});
});
