import { afterEach, describe, expect, it } from "bun:test";
import type { Account } from "@ccflare/types";
import { KIMI_OAUTH_CLIENT_ID, KIMI_OAUTH_TOKEN_URL } from "./oauth";
import { KimiProvider } from "./provider";

const originalFetch = globalThis.fetch;

function account(overrides: Partial<Account> = {}): Account {
	return {
		id: "kimi-account",
		name: "kimi",
		provider: "kimi",
		api_key: null,
		refresh_token: "stored-refresh",
		access_token: "stored-access",
		expires_at: Date.now() + 900_000,
		request_count: 0,
		total_requests: 0,
		last_used: null,
		created_at: Date.now(),
		rate_limited_until: null,
		session_start: null,
		session_request_count: 0,
		account_tier: 1,
		paused: false,
		rate_limit_reset: null,
		rate_limit_status: null,
		rate_limit_remaining: null,
		auth_method: "oauth",
		base_url: null,
		...overrides,
	} as Account;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("KimiProvider", () => {
	it("builds upstream URLs from the stripped Kimi path", () => {
		const provider = new KimiProvider();
		expect(provider.buildUrl("/chat/completions", "")).toBe(
			"https://api.kimi.com/coding/v1/chat/completions",
		);
	});

	it("sets Bearer auth and strips Anthropic-family headers", () => {
		const provider = new KimiProvider();
		const headers = provider.prepareHeaders(
			new Headers({
				"x-api-key": "leftover",
				"anthropic-version": "2023-06-01",
				host: "localhost:8080",
			}),
			account(),
		);

		expect(headers.get("Authorization")).toBe("Bearer stored-access");
		expect(headers.get("x-api-key")).toBeNull();
		expect(headers.get("anthropic-version")).toBeNull();
		expect(headers.get("host")).toBeNull();
	});

	it("refreshes with the device-flow client id and honors token rotation", async () => {
		const provider = new KimiProvider();
		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = new Request(input, init);
				expect(request.url).toBe(KIMI_OAUTH_TOKEN_URL);
				const body = await request.text();
				expect(body).toContain("grant_type=refresh_token");
				expect(body).toContain("refresh_token=stored-refresh");
				expect(body).toContain(`client_id=${KIMI_OAUTH_CLIENT_ID}`);

				return new Response(
					JSON.stringify({
						access_token: "new-access",
						refresh_token: "rotated-refresh",
						expires_in: 900,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		const result = await provider.refreshToken(account(), "ignored-client-id");

		expect(result.accessToken).toBe("new-access");
		expect(result.refreshToken).toBe("rotated-refresh");
		expect(result.expiresAt).toBeGreaterThan(Date.now());
	});

	it("keeps the stored refresh token when the server omits a new one", async () => {
		const provider = new KimiProvider();
		globalThis.fetch = Object.assign(
			async () =>
				new Response(
					JSON.stringify({ access_token: "new-access", expires_in: 900 }),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		const result = await provider.refreshToken(account(), "ignored-client-id");

		expect(result.refreshToken).toBe("stored-refresh");
	});
});
