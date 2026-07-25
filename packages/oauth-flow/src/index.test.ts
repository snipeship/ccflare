import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Config } from "@ccflare/config";
import { DatabaseFactory } from "@ccflare/database";
import { createOAuthFlow } from "./index";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

function createTestContext() {
	const tempDir = mkdtempSync(join(tmpdir(), "ccflare-oauth-flow-"));
	tempDirs.push(tempDir);

	const config = new Config(join(tempDir, "config.json"));
	DatabaseFactory.reset();
	DatabaseFactory.initialize(join(tempDir, "ccflare.db"));
	const dbOps = DatabaseFactory.getInstance();

	return { config, dbOps };
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	DatabaseFactory.reset();

	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop() as string, { force: true, recursive: true });
	}
});

describe("OAuthFlow", () => {
	it("stores the auth flow in auth_sessions with generic state_json", async () => {
		const { config, dbOps } = createTestContext();
		const oauthFlow = await createOAuthFlow(dbOps, config);

		const result = await oauthFlow.begin({
			name: "claude-code-session-account",
			provider: "claude-code",
		});

		const row = dbOps.getAuthSession(result.sessionId);

		expect(row).toEqual(
			expect.objectContaining({
				provider: "claude-code",
				authMethod: "oauth",
				accountName: "claude-code-session-account",
			}),
		);
		expect(JSON.parse(row?.stateJson ?? "{}")).toEqual(
			expect.objectContaining({
				verifier: result.pkce.verifier,
				state: result.pkce.verifier,
				status: "pending",
			}),
		);
	});

	it("starts a Claude Code OAuth flow with the hosted callback redirect URI", async () => {
		const { config, dbOps } = createTestContext();
		const oauthFlow = await createOAuthFlow(dbOps, config);

		const result = await oauthFlow.begin({
			name: "claude-code-oauth-account",
			provider: "claude-code",
		});

		const authUrl = new URL(result.authUrl);
		expect(`${authUrl.origin}${authUrl.pathname}`).toBe(
			"https://claude.ai/oauth/authorize",
		);
		expect(authUrl.searchParams.get("redirect_uri")).toBe(
			"https://platform.claude.com/oauth/code/callback",
		);
		expect(authUrl.searchParams.get("state")).toBe(result.pkce.verifier);
		expect(authUrl.searchParams.get("scope")).toContain(
			"user:sessions:claude_code",
		);
	});

	it("starts a Codex OAuth flow with the expected auth URL and auth session", async () => {
		const { config, dbOps } = createTestContext();
		const oauthFlow = await createOAuthFlow(dbOps, config);

		const result = await oauthFlow.begin({
			name: "codex-oauth-account",
			provider: "codex",
		});

		const authUrl = new URL(result.authUrl);
		expect(`${authUrl.origin}${authUrl.pathname}`).toBe(
			"https://auth.openai.com/oauth/authorize",
		);
		expect(authUrl.searchParams.get("client_id")).toBe(
			"app_EMoamEEZ73f0CkXaXp7hrann",
		);
		expect(authUrl.searchParams.get("scope")).toBe(
			"openid profile email offline_access api.connectors.read api.connectors.invoke",
		);
		expect(authUrl.searchParams.get("codex_cli_simplified_flow")).toBe("true");
		expect(authUrl.searchParams.get("originator")).toBe("codex_cli_rs");

		expect(dbOps.getAuthSession(result.sessionId)).toEqual(
			expect.objectContaining({
				provider: "codex",
				authMethod: "oauth",
				accountName: "codex-oauth-account",
			}),
		);
		expect(
			JSON.parse(dbOps.getAuthSession(result.sessionId)?.stateJson ?? "{}"),
		).toEqual(
			expect.objectContaining({
				verifier: result.pkce.verifier,
				state: result.pkce.verifier,
				status: "pending",
			}),
		);
	});

	it("completes a Codex OAuth flow and stores OAuth tokens on the account", async () => {
		const { config, dbOps } = createTestContext();
		const oauthFlow = await createOAuthFlow(dbOps, config);
		const flowResult = await oauthFlow.begin({
			name: "codex-complete-account",
			provider: "codex",
		});

		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = new Request(input, init);
				expect(request.url).toBe("https://auth.openai.com/oauth/token");
				expect(await request.text()).toContain(
					"client_id=app_EMoamEEZ73f0CkXaXp7hrann",
				);

				return new Response(
					JSON.stringify({
						access_token: "openai-access-token",
						refresh_token: "openai-refresh-token",
						expires_in: 3600,
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json",
						},
					},
				);
			},
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		const createdAccount = await oauthFlow.complete({
			sessionId: flowResult.sessionId,
			code: "codex-auth-code",
		});

		expect(createdAccount).toEqual({
			id: expect.any(String),
			name: "codex-complete-account",
			provider: "codex",
			authType: "oauth",
		});

		expect(dbOps.getAccount(createdAccount.id)).toEqual(
			expect.objectContaining({
				id: createdAccount.id,
				name: "codex-complete-account",
				provider: "codex",
				auth_method: "oauth",
				api_key: null,
				access_token: "openai-access-token",
				refresh_token: "openai-refresh-token",
				expires_at: expect.any(Number),
			}),
		);
		expect(dbOps.getAuthSession(flowResult.sessionId)).toEqual(
			expect.objectContaining({
				id: flowResult.sessionId,
			}),
		);
		expect(
			JSON.parse(dbOps.getAuthSession(flowResult.sessionId)?.stateJson ?? "{}"),
		).toEqual(
			expect.objectContaining({
				status: "completed",
				state: flowResult.pkce.verifier,
			}),
		);
	});
	it("begins a Kimi device flow without PKCE and stores the device code", async () => {
		const { config, dbOps } = createTestContext();
		const oauthFlow = await createOAuthFlow(dbOps, config);

		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = new Request(input, init);
				expect(request.url).toBe(
					"https://auth.kimi.com/api/oauth/device_authorization",
				);

				return new Response(
					JSON.stringify({
						device_code: "kimi-device-code",
						user_code: "ABCD-1234",
						verification_uri: "https://www.kimi.com/code/authorize_device",
						verification_uri_complete:
							"https://www.kimi.com/code/authorize_device?user_code=ABCD-1234",
						expires_in: 1800,
						interval: 5,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		const result = await oauthFlow.begin({
			name: "kimi-device-account",
			provider: "kimi",
		});

		expect(result.authUrl).toBe(
			"https://www.kimi.com/code/authorize_device?user_code=ABCD-1234",
		);
		expect(result.userCode).toBe("ABCD-1234");
		expect(result.pkce.verifier).toBe("kimi-device-code");
		expect(
			JSON.parse(dbOps.getAuthSession(result.sessionId)?.stateJson ?? "{}"),
		).toEqual(
			expect.objectContaining({
				verifier: "kimi-device-code",
				status: "pending",
			}),
		);
	});
});
