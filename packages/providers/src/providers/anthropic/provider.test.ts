import { describe, expect, it } from "bun:test";
import {
	createApiKeyAccount,
	expectBuildUrlCases,
	expectNoOAuthSupport,
	expectRemovedHeaders,
	expectUnifiedRateLimit,
} from "../../test-helpers";
import { AnthropicProvider } from "./provider";

describe("AnthropicProvider", () => {
	const provider = new AnthropicProvider();

	it("builds upstream URLs from the stripped Anthropic path", () => {
		expectBuildUrlCases(provider, [
			{
				upstreamPath: "/v1/messages",
				expected: "https://api.anthropic.com/v1/messages",
			},
			{
				upstreamPath: "/v1/models",
				query: "?foo=bar&baz=qux",
				expected: "https://api.anthropic.com/v1/models?foo=bar&baz=qux",
			},
			{
				upstreamPath: "/v1/messages",
				account: createApiKeyAccount("anthropic", {
					base_url: "https://anthropic.internal/",
				}),
				expected: "https://anthropic.internal/v1/messages",
			},
		]);
	});

	it("injects x-api-key for API key accounts", () => {
		const headers = provider.prepareHeaders(
			new Headers({
				host: "localhost:8080",
				"accept-encoding": "gzip",
				"content-encoding": "gzip",
			}),
			createApiKeyAccount("anthropic"),
		);

		expect(headers.get("x-api-key")).toBe("sk-ant-test");
		expect(headers.get("authorization")).toBeNull();
		expectRemovedHeaders(headers, [
			"host",
			"accept-encoding",
			"content-encoding",
		]);
	});

	it("ignores OAuth access tokens and does not expose OAuth helpers", () => {
		const headers = provider.prepareHeaders(
			new Headers({
				host: "localhost:8080",
			}),
			createApiKeyAccount("anthropic", {
				auth_method: "oauth",
				api_key: null,
				access_token: "oauth-access-token",
				refresh_token: "oauth-refresh-token",
				expires_at: Date.now() + 60_000,
			}),
		);

		expect(headers.get("authorization")).toBeNull();
		expectRemovedHeaders(headers, ["x-api-key", "host"]);
		expectNoOAuthSupport(provider);
	});

	it("parses Anthropic unified rate limit headers", () => {
		const resetSeconds = Math.floor((Date.now() + 120_000) / 1000);
		const response = new Response("{}", {
			status: 200,
			headers: {
				"anthropic-ratelimit-unified-status": "allowed",
				"anthropic-ratelimit-unified-reset": String(resetSeconds),
				"anthropic-ratelimit-unified-remaining": "17",
			},
		});

		expectUnifiedRateLimit(provider, response, {
			isRateLimited: false,
			resetTime: resetSeconds * 1000,
			statusHeader: "allowed",
			remaining: 17,
		});
	});

	it("does not bench an account that succeeds while over its limit", () => {
		// 200 response whose primary limit shows "rejected": the account is still
		// serving (e.g. via overage), so it must not be marked rate-limited.
		const response = new Response("{}", {
			status: 200,
			headers: {
				"anthropic-ratelimit-unified-status": "rejected",
				"anthropic-ratelimit-unified-reset": String(
					Math.floor((Date.now() + 3 * 3600_000) / 1000),
				),
			},
		});

		expect(provider.parseRateLimit(response).isRateLimited).toBe(false);
	});

	it("uses a short cooldown (not the multi-hour reset) when overage is available", () => {
		// A 429 at the limit boundary while overage is allowed is transient — the
		// account can still serve. We must not bench it until the primary reset.
		const primaryResetSeconds = Math.floor((Date.now() + 3 * 3600_000) / 1000);
		const response = new Response("{}", {
			status: 429,
			headers: {
				"anthropic-ratelimit-unified-status": "rejected",
				"anthropic-ratelimit-unified-reset": String(primaryResetSeconds),
				"anthropic-ratelimit-unified-overage-status": "allowed",
			},
		});

		const info = provider.parseRateLimit(response);
		expect(info.isRateLimited).toBe(true);
		// Cooldown is a short window from now, far below the multi-hour reset.
		expect(info.resetTime).toBeGreaterThan(Date.now());
		expect(info.resetTime).toBeLessThan(Date.now() + 5 * 60_000);
		expect(info.resetTime).toBeLessThan(primaryResetSeconds * 1000);
	});
});
