import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Config } from "@ccflare/config";
import { DatabaseFactory } from "@ccflare/database";
import { stopAllOAuthCallbackForwarders } from "./handlers/oauth";
import { APIRouter } from "./router";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

function createRouterContext() {
	const tempDir = mkdtempSync(join(tmpdir(), "ccflare-http-api-"));
	tempDirs.push(tempDir);

	const config = new Config(join(tempDir, "config.json"));
	DatabaseFactory.reset();
	DatabaseFactory.initialize(join(tempDir, "ccflare.db"));
	const dbOps = DatabaseFactory.getInstance();

	return {
		config,
		dbOps,
		router: new APIRouter({
			config,
			dbOps,
			getProviders: () => ["anthropic", "openai", "claude-code", "codex"],
		}),
	};
}

function createRouter() {
	return createRouterContext().router;
}

function encode(value: string): string {
	return Buffer.from(value, "utf8").toString("base64");
}

async function apiRequest(
	router: APIRouter,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	const request = new Request(`http://localhost:8080${path}`, {
		method,
		headers:
			body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const response = await router.handleRequest(new URL(request.url), request);
	expect(response).not.toBeNull();
	return response as Response;
}

async function createApiKeyAccount(
	router: APIRouter,
	overrides: Record<string, unknown> = {},
): Promise<{ accountId: string }> {
	const response = await apiRequest(router, "POST", "/api/accounts", {
		name: "test-account",
		provider: "anthropic",
		auth_method: "api_key",
		api_key: "test-key",
		...overrides,
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as {
		data: { accountId: string };
	};
	return { accountId: body.data.accountId };
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	stopAllOAuthCallbackForwarders();
	DatabaseFactory.reset();

	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop() as string, { force: true, recursive: true });
	}
});

describe("APIRouter", () => {
	it("returns 404 for removed agent endpoints", async () => {
		const router = createRouter();

		for (const path of [
			"/api/agents",
			"/api/workspaces",
			"/api/config/model",
		]) {
			const response = await router.handleRequest(
				new URL(`http://localhost:8080${path}`),
				new Request(`http://localhost:8080${path}`),
			);

			expect(response).not.toBeNull();
			expect(response?.status).toBe(404);
		}
	});

	it("omits agent keys from the config response", async () => {
		const router = createRouter();
		const response = await router.handleRequest(
			new URL("http://localhost:8080/api/config"),
			new Request("http://localhost:8080/api/config"),
		);

		expect(response).not.toBeNull();
		expect(response?.status).toBe(200);

		const body = (await response?.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty("default_agent_model");
		expect(Object.keys(body).some((key) => key.includes("agent"))).toBe(false);
	});

	it("validates config strategy, retention, and analytics inputs", async () => {
		const router = createRouter();

		const invalidStrategy = await apiRequest(
			router,
			"POST",
			"/api/config/strategy",
			{ strategy: "round_robin" },
		);
		expect(invalidStrategy.status).toBe(400);

		const invalidRetention = await apiRequest(
			router,
			"POST",
			"/api/config/retention",
			[],
		);
		expect(invalidRetention.status).toBe(400);

		const invalidRange = await apiRequest(
			router,
			"GET",
			"/api/analytics?range=12h",
		);
		expect(invalidRange.status).toBe(400);

		const invalidProvider = await apiRequest(
			router,
			"GET",
			"/api/analytics?providers=gemini",
		);
		expect(invalidProvider.status).toBe(400);
	});

	it("returns analytics with shared bucket metadata for the 1h range", async () => {
		const { router, dbOps } = createRouterContext();
		const account = dbOps.createAccount({
			name: "analytics-owner",
			provider: "openai",
			auth_method: "api_key",
			api_key: "sk-test",
		});
		const now = Date.now();

		dbOps.saveRequest(
			"analytics-one",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			account.id,
			200,
			true,
			null,
			50,
			0,
			{
				model: "gpt-4o-mini",
				totalTokens: 12,
				costUsd: 0.4,
				inputTokens: 5,
				outputTokens: 7,
			},
			{ timestamp: now - 30_000 },
		);

		const response = await apiRequest(router, "GET", "/api/analytics?range=1h");
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			meta: { range: string; bucket: string };
			timeSeries: Array<{ ts: number; requests: number }>;
			totals: { requests: number };
		};
		expect(body.meta).toEqual(
			expect.objectContaining({
				range: "1h",
				bucket: "1m",
			}),
		);
		expect(body.totals.requests).toBe(1);
		expect(body.timeSeries).toEqual([
			expect.objectContaining({
				requests: 1,
			}),
		]);
	});

	it("returns the supported providers from health", async () => {
		const router = createRouter();
		const response = await router.handleRequest(
			new URL("http://localhost:8080/health"),
			new Request("http://localhost:8080/health"),
		);

		expect(response).not.toBeNull();
		expect(response?.status).toBe(200);

		const body = (await response?.json()) as {
			providers: string[];
			status: string;
		};
		expect(body.status).toBe("ok");
		expect(body.providers).toEqual([
			"anthropic",
			"openai",
			"claude-code",
			"codex",
		]);
	});

	it("includes runtime health details in the health response when available", async () => {
		const { config, dbOps } = createRouterContext();
		const router = new APIRouter({
			config,
			dbOps,
			getProviders: () => ["anthropic", "openai", "claude-code", "codex"],
			getRuntimeHealth: () => ({
				asyncWriter: {
					healthy: true,
					failureCount: 0,
					queuedJobs: 0,
				},
				usageWorker: {
					state: "ready",
					queuedMessages: 0,
					pendingAcks: 0,
					lastError: null,
				},
			}),
		});

		const response = await router.handleRequest(
			new URL("http://localhost:8080/health"),
			new Request("http://localhost:8080/health"),
		);
		expect(response).not.toBeNull();

		const body = (await response?.json()) as {
			runtime: {
				asyncWriter: {
					healthy: boolean;
					failureCount: number;
					queuedJobs: number;
				};
				usageWorker: { state: string };
			};
		};
		expect(body.runtime.asyncWriter).toEqual({
			healthy: true,
			failureCount: 0,
			queuedJobs: 0,
		});
		expect(body.runtime.usageWorker.state).toBe("ready");
	});

	it("validates account creation payloads", async () => {
		const router = createRouter();

		const missingProvider = await apiRequest(router, "POST", "/api/accounts", {
			name: "missing-provider",
			auth_method: "api_key",
			api_key: "test-key",
		});
		expect(missingProvider.status).toBe(400);

		const unknownProvider = await apiRequest(router, "POST", "/api/accounts", {
			name: "unknown-provider",
			provider: "gemini",
			auth_method: "api_key",
			api_key: "test-key",
		});
		expect(unknownProvider.status).toBe(400);
		expect((await unknownProvider.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("claude-code"),
			}),
		);

		const missingName = await apiRequest(router, "POST", "/api/accounts", {
			provider: "anthropic",
			auth_method: "api_key",
			api_key: "test-key",
		});
		expect(missingName.status).toBe(400);

		await createApiKeyAccount(router, { name: "duplicate-name" });
		const duplicateName = await apiRequest(router, "POST", "/api/accounts", {
			name: "duplicate-name",
			provider: "openai",
			auth_method: "api_key",
			api_key: "test-key",
		});
		expect(duplicateName.status).toBe(400);

		const missingApiKey = await apiRequest(router, "POST", "/api/accounts", {
			name: "missing-api-key",
			provider: "openai",
			auth_method: "api_key",
		});
		expect(missingApiKey.status).toBe(400);

		const unexpectedField = await apiRequest(router, "POST", "/api/accounts", {
			name: "unexpected-field",
			provider: "openai",
			auth_method: "api_key",
			api_key: "test-key",
			legacy_setting: "unsupported",
		});
		expect(unexpectedField.status).toBe(400);
	});

	it("accepts all 4 providers with the matching auth_method", async () => {
		const router = createRouter();

		const anthropicResponse = await apiRequest(
			router,
			"POST",
			"/api/accounts",
			{
				name: "anthropic-key",
				provider: "anthropic",
				auth_method: "api_key",
				api_key: "sk-ant-test",
			},
		);
		expect(anthropicResponse.status).toBe(200);

		const openAiResponse = await apiRequest(router, "POST", "/api/accounts", {
			name: "openai-key",
			provider: "openai",
			auth_method: "api_key",
			api_key: "sk-openai-test",
		});
		expect(openAiResponse.status).toBe(200);

		const claudeCodeResponse = await apiRequest(
			router,
			"POST",
			"/api/accounts",
			{
				name: "claude-code-oauth",
				provider: "claude-code",
				auth_method: "oauth",
				access_token: "claude-access-token",
			},
		);
		expect(claudeCodeResponse.status).toBe(200);

		const codexResponse = await apiRequest(router, "POST", "/api/accounts", {
			name: "codex-oauth",
			provider: "codex",
			auth_method: "oauth",
			access_token: "codex-access-token",
		});
		expect(codexResponse.status).toBe(200);

		const accounts = (await (
			await apiRequest(router, "GET", "/api/accounts")
		).json()) as Array<{
			name: string;
			provider: string;
			auth_method: string;
		}>;
		expect(accounts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "anthropic-key",
					provider: "anthropic",
					auth_method: "api_key",
				}),
				expect.objectContaining({
					name: "openai-key",
					provider: "openai",
					auth_method: "api_key",
				}),
				expect.objectContaining({
					name: "claude-code-oauth",
					provider: "claude-code",
					auth_method: "oauth",
				}),
				expect.objectContaining({
					name: "codex-oauth",
					provider: "codex",
					auth_method: "oauth",
				}),
			]),
		);
	});

	it("rejects auth_method values that do not match the provider restrictions", async () => {
		const router = createRouter();

		const anthropicOauth = await apiRequest(router, "POST", "/api/accounts", {
			name: "anthropic-oauth",
			provider: "anthropic",
			auth_method: "oauth",
			access_token: "anthropic-access-token",
		});
		expect(anthropicOauth.status).toBe(400);
		expect((await anthropicOauth.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("anthropic"),
			}),
		);

		const openAiOauth = await apiRequest(router, "POST", "/api/accounts", {
			name: "openai-oauth",
			provider: "openai",
			auth_method: "oauth",
			access_token: "openai-access-token",
		});
		expect(openAiOauth.status).toBe(400);
		expect((await openAiOauth.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("api_key"),
			}),
		);

		const claudeCodeApiKey = await apiRequest(router, "POST", "/api/accounts", {
			name: "claude-code-api-key",
			provider: "claude-code",
			auth_method: "api_key",
			api_key: "sk-claude-code",
		});
		expect(claudeCodeApiKey.status).toBe(400);
		expect((await claudeCodeApiKey.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("claude-code"),
			}),
		);

		const codexApiKey = await apiRequest(router, "POST", "/api/accounts", {
			name: "codex-api-key",
			provider: "codex",
			auth_method: "api_key",
			api_key: "sk-codex",
		});
		expect(codexApiKey.status).toBe(400);
		expect((await codexApiKey.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("oauth"),
			}),
		);
	});

	it("lists provider, auth_method, and base_url for created accounts", async () => {
		const router = createRouter();

		await createApiKeyAccount(router, {
			name: "anthropic-key",
			base_url: "https://anthropic.internal",
		});
		await createApiKeyAccount(router, {
			name: "openai-key",
			provider: "openai",
			base_url: "https://openai.internal/v1",
		});

		const response = await apiRequest(router, "GET", "/api/accounts");
		expect(response.status).toBe(200);

		const accounts = (await response.json()) as Array<{
			name: string;
			provider: string;
			auth_method: string;
			base_url: string | null;
		}>;
		expect(accounts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "anthropic-key",
					provider: "anthropic",
					auth_method: "api_key",
					base_url: "https://anthropic.internal",
				}),
				expect.objectContaining({
					name: "openai-key",
					provider: "openai",
					auth_method: "api_key",
					base_url: "https://openai.internal/v1",
				}),
			]),
		);
	});

	it("uses weight-only account responses", async () => {
		const router = createRouter();

		const createResponse = await apiRequest(router, "POST", "/api/accounts", {
			name: "weight-default",
			provider: "anthropic",
			auth_method: "api_key",
			api_key: "sk-ant-test",
		});
		expect(createResponse.status).toBe(200);
		const createBody = (await createResponse.json()) as {
			success: boolean;
			message: string;
			data: {
				accountId: string;
				weight: number;
				authMethod: string;
			};
		};
		expect(createBody).toEqual({
			success: true,
			message: "Account 'weight-default' added successfully",
			data: {
				accountId: expect.any(String),
				weight: 1,
				authMethod: "api_key",
			},
		});

		const listResponse = await apiRequest(router, "GET", "/api/accounts");
		expect(listResponse.status).toBe(200);
		const accounts = (await listResponse.json()) as Array<{
			id: string;
			name: string;
			provider: string;
			auth_method: string;
			base_url: string | null;
			requestCount: number;
			totalRequests: number;
			lastUsed: string | null;
			created: string;
			weight: number;
			paused: boolean;
			tokenStatus: "valid" | "expired";
			tokenExpiresAt: string | null;
			rateLimitStatus: {
				code: string;
				isLimited: boolean;
				until: string | null;
			};
			rateLimitReset: string | null;
			rateLimitRemaining: number | null;
			sessionInfo: {
				active: boolean;
				startedAt: string | null;
				requestCount: number;
			};
		}>;
		expect(accounts).toEqual([
			{
				id: createBody.data.accountId,
				name: "weight-default",
				provider: "anthropic",
				auth_method: "api_key",
				base_url: null,
				requestCount: 0,
				totalRequests: 0,
				lastUsed: null,
				created: expect.any(String),
				weight: 1,
				paused: false,
				tokenStatus: "expired",
				tokenExpiresAt: null,
				rateLimitStatus: {
					code: "ok",
					isLimited: false,
					until: null,
				},
				rateLimitReset: null,
				rateLimitRemaining: null,
				sessionInfo: {
					active: false,
					startedAt: null,
					requestCount: 0,
				},
			},
		]);
	});

	it("deletes accounts by id", async () => {
		const router = createRouter();
		const { accountId } = await createApiKeyAccount(router, {
			name: "deletable-account",
		});

		const deleteResponse = await apiRequest(
			router,
			"DELETE",
			`/api/accounts/${accountId}`,
		);
		expect(deleteResponse.status).toBe(200);

		const listResponse = await apiRequest(router, "GET", "/api/accounts");
		const accounts = (await listResponse.json()) as Array<{ id: string }>;
		expect(accounts).toEqual([]);
	});

	it("pauses and resumes accounts idempotently", async () => {
		const router = createRouter();
		const { accountId } = await createApiKeyAccount(router, {
			name: "pauseable-account",
		});

		const firstPause = await apiRequest(
			router,
			"POST",
			`/api/accounts/${accountId}/pause`,
		);
		const secondPause = await apiRequest(
			router,
			"POST",
			`/api/accounts/${accountId}/pause`,
		);
		expect(firstPause.status).toBe(200);
		expect(secondPause.status).toBe(200);

		const pausedAccounts = (await (
			await apiRequest(router, "GET", "/api/accounts")
		).json()) as Array<{ id: string; paused: boolean }>;
		expect(pausedAccounts).toEqual([
			expect.objectContaining({ id: accountId, paused: true }),
		]);

		const firstResume = await apiRequest(
			router,
			"POST",
			`/api/accounts/${accountId}/resume`,
		);
		const secondResume = await apiRequest(
			router,
			"POST",
			`/api/accounts/${accountId}/resume`,
		);
		expect(firstResume.status).toBe(200);
		expect(secondResume.status).toBe(200);

		const resumedAccounts = (await (
			await apiRequest(router, "GET", "/api/accounts")
		).json()) as Array<{ id: string; paused: boolean }>;
		expect(resumedAccounts).toEqual([
			expect.objectContaining({ id: accountId, paused: false }),
		]);
	});

	it("updates accounts via PATCH", async () => {
		const router = createRouter();
		const { accountId } = await createApiKeyAccount(router, {
			name: "rename-me",
		});

		const patchResponse = await apiRequest(
			router,
			"PATCH",
			`/api/accounts/${accountId}`,
			{
				name: "renamed-account",
				base_url: "https://custom.endpoint/v1",
			},
		);
		expect(patchResponse.status).toBe(200);

		const accounts = (await (
			await apiRequest(router, "GET", "/api/accounts")
		).json()) as Array<{
			id: string;
			name: string;
			base_url: string | null;
		}>;
		expect(accounts).toEqual([
			expect.objectContaining({
				id: accountId,
				name: "renamed-account",
				base_url: "https://custom.endpoint/v1",
			}),
		]);

		const unexpectedFieldResponse = await apiRequest(
			router,
			"PATCH",
			`/api/accounts/${accountId}`,
			{
				name: "still-renamed-account",
				legacy_setting: "unsupported",
			},
		);
		expect(unexpectedFieldResponse.status).toBe(400);
	});

	it("resets stats consistently through the API", async () => {
		const { router, dbOps } = createRouterContext();
		const account = dbOps.createAccount({
			name: "reset-owner",
			provider: "anthropic",
			auth_method: "api_key",
			api_key: "sk-test",
		});

		dbOps.updateAccountUsage(account.id);
		dbOps.saveRequest(
			"stats-reset-request",
			"POST",
			"/v1/anthropic/v1/messages",
			"anthropic",
			"/v1/messages",
			account.id,
			200,
			true,
			null,
			25,
			0,
		);

		const resetResponse = await apiRequest(router, "POST", "/api/stats/reset");
		expect(resetResponse.status).toBe(200);
		expect((await resetResponse.json()) as { success: boolean }).toEqual(
			expect.objectContaining({ success: true }),
		);

		const statsResponse = await apiRequest(router, "GET", "/api/stats");
		expect(statsResponse.status).toBe(200);
		expect(
			(await statsResponse.json()) as {
				totalRequests: number;
				recentErrors: string[];
				topModels: Array<{ model: string; count: number }>;
			},
		).toEqual(
			expect.objectContaining({
				totalRequests: 0,
				recentErrors: [],
				topModels: [],
			}),
		);

		expect(dbOps.getAccount(account.id)).toEqual(
			expect.objectContaining({
				request_count: 0,
				session_request_count: 0,
				session_start: null,
			}),
		);
	});

	it("preserves zero-valued usage fields in request summaries", async () => {
		const { router, dbOps } = createRouterContext();
		dbOps.saveRequest(
			"request-zero",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			0,
			0,
			{
				model: "gpt-4o-mini",
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				costUsd: 0,
				inputTokens: 0,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				tokensPerSecond: 0,
			},
		);

		const response = await apiRequest(router, "GET", "/api/requests?limit=1");
		expect(response.status).toBe(200);
		expect((await response.json()) as Array<Record<string, unknown>>).toEqual([
			expect.objectContaining({
				id: "request-zero",
				method: "POST",
				provider: "openai",
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				inputTokens: 0,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				costUsd: 0,
				tokensPerSecond: 0,
			}),
		]);
	});

	it("preserves null metadata fields in request summaries instead of omitting them", async () => {
		const { router, dbOps } = createRouterContext();
		dbOps.saveRequest(
			"request-null-metadata",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			0,
			0,
		);

		const response = await apiRequest(router, "GET", "/api/requests?limit=1");
		expect(response.status).toBe(200);
		expect((await response.json()) as Array<Record<string, unknown>>).toEqual([
			expect.objectContaining({
				id: "request-null-metadata",
				model: null,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				inputTokens: null,
				cacheReadInputTokens: null,
				cacheCreationInputTokens: null,
				outputTokens: null,
				reasoningTokens: null,
				costUsd: null,
				tokensPerSecond: null,
			}),
		]);
	});

	it("keeps request summaries keyed by account id and exposes account names separately", async () => {
		const { router, dbOps } = createRouterContext();
		const { accountId } = await createApiKeyAccount(router, {
			name: "request-owner",
			provider: "openai",
		});

		dbOps.saveRequest(
			"request-owner-summary",
			"POST",
			"/v1/openai/chat/completions",
			"openai",
			"/chat/completions",
			accountId,
			200,
			true,
			null,
			42,
			0,
		);

		const response = await apiRequest(router, "GET", "/api/requests?limit=1");
		expect(response.status).toBe(200);
		expect((await response.json()) as Array<Record<string, unknown>>).toEqual([
			expect.objectContaining({
				id: "request-owner-summary",
				accountUsed: accountId,
				accountName: "request-owner",
			}),
		]);
	});

	it("keeps large payloads out of summaries and returns one exact detail", async () => {
		const { router, dbOps } = createRouterContext();
		const { accountId } = await createApiKeyAccount(router, {
			name: "payload-owner",
		});

		dbOps.saveRequest(
			"request-payload",
			"POST",
			"/v1/anthropic/v1/messages",
			"anthropic",
			"/v1/messages",
			accountId,
			200,
			true,
			null,
			21,
			0,
		);
		const sentinel = `sentinel-${"x".repeat(3 * 1024 * 1024)}`;
		dbOps.saveRequestPayload("request-payload", {
			id: "request-payload",
			request: { headers: {}, body: sentinel },
			response: { status: 200, headers: {}, body: null },
			meta: {
				trace: {
					timestamp: 123,
					method: "POST",
					path: "/v1/anthropic/v1/messages",
					provider: "anthropic",
					upstreamPath: "/v1/messages",
				},
				account: {
					id: accountId,
				},
				transport: {
					success: true,
					pending: false,
					retry: 0,
				},
			},
		});

		const summaryResponse = await apiRequest(
			router,
			"GET",
			"/api/requests?limit=200",
		);
		const summaryText = await summaryResponse.text();
		expect(summaryResponse.status).toBe(200);
		expect(summaryText).not.toContain("sentinel-");

		const response = await apiRequest(
			router,
			"GET",
			"/api/requests/request-payload/detail",
		);
		expect(response.status).toBe(200);
		const detailText = await response.text();
		expect(detailText).toContain(sentinel);
		expect(JSON.parse(detailText) as Record<string, unknown>).toEqual(
			expect.objectContaining({
				id: "request-payload",
				meta: {
					trace: {
						timestamp: 123,
						method: "POST",
						path: "/v1/anthropic/v1/messages",
						provider: "anthropic",
						upstreamPath: "/v1/messages",
					},
					account: {
						id: accountId,
						name: "payload-owner",
					},
					transport: {
						success: true,
						pending: false,
						retry: 0,
					},
				},
			}),
		);
		expect(
			(await apiRequest(router, "GET", "/api/requests/unknown/detail")).status,
		).toBe(404);
		expect(
			(await apiRequest(router, "GET", "/api/requests/detail?limit=1")).status,
		).toBe(404);
	});

	it("returns the conversation ancestor chain for a request", async () => {
		const { router, dbOps } = createRouterContext();

		dbOps.saveRequest(
			"request-root",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 1_000,
				payload: {
					id: "request-root",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "root",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-root"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 1_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);
		dbOps.saveRequest(
			"request-child",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 2_000,
				payload: {
					id: "request-child",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "child",
								previous_response_id: "resp-root",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-child"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 2_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);
		dbOps.saveRequest(
			"request-grandchild",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 3_000,
				payload: {
					id: "request-grandchild",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "grandchild",
								previous_response_id: "resp-child",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-grandchild"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 3_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);

		const response = await apiRequest(
			router,
			"GET",
			"/api/requests/request-child/conversation",
		);
		expect(response.status).toBe(200);
		expect(
			((await response.json()) as Array<{ id: string }>).map((row) => row.id),
		).toEqual(["request-root", "request-child"]);
	});

	it("excludes sibling branches from the request conversation endpoint", async () => {
		const { router, dbOps } = createRouterContext();

		dbOps.saveRequest(
			"root",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 1_000,
				payload: {
					id: "root",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "root",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-root"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 1_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);
		dbOps.saveRequest(
			"branch-a",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 2_000,
				payload: {
					id: "branch-a",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "branch-a",
								previous_response_id: "resp-root",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-a"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 2_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);
		dbOps.saveRequest(
			"branch-b",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 3_000,
				payload: {
					id: "branch-b",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "branch-b",
								previous_response_id: "resp-root",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-b"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 3_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);
		dbOps.saveRequest(
			"leaf-a",
			"POST",
			"/v1/openai/responses",
			"openai",
			"/responses",
			null,
			200,
			true,
			null,
			10,
			0,
			undefined,
			{
				timestamp: 4_000,
				payload: {
					id: "leaf-a",
					request: {
						headers: {},
						body: encode(
							JSON.stringify({
								type: "response.create",
								input: "leaf-a",
								previous_response_id: "resp-a",
							}),
						),
					},
					response: {
						status: 200,
						headers: {},
						body: encode(
							[
								"event: response.created",
								'data: {"type":"response.created","response":{"id":"resp-leaf-a"}}',
								"",
							].join("\n"),
						),
					},
					meta: {
						trace: { timestamp: 4_000 },
						account: { id: null },
						transport: { success: true },
					},
				},
			},
		);

		const response = await apiRequest(
			router,
			"GET",
			"/api/requests/leaf-a/conversation",
		);
		expect(response.status).toBe(200);
		expect(
			((await response.json()) as Array<{ id: string }>).map((row) => row.id),
		).toEqual(["root", "branch-a", "leaf-a"]);
	});

	it("routes auth init and complete by provider restrictions", async () => {
		const { router, dbOps } = createRouterContext();

		const anthropicInitResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/anthropic/init",
			{
				name: "anthropic-account",
			},
		);
		expect(anthropicInitResponse.status).toBe(400);
		expect((await anthropicInitResponse.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("does not support auth flows"),
			}),
		);

		const openAiInitResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/claude-code/init",
			{
				name: "claude-code-oauth-account",
			},
		);
		expect(openAiInitResponse.status).toBe(200);

		const openAiInitBody = (await openAiInitResponse.json()) as {
			data: { authUrl: string; sessionId: string };
		};
		expect(openAiInitBody.data.authUrl).toContain("https://claude.ai");
		expect(
			new URL(openAiInitBody.data.authUrl).searchParams.get("redirect_uri"),
		).toBe("https://platform.claude.com/oauth/code/callback");
		expect(dbOps.getAuthSession(openAiInitBody.data.sessionId)).toEqual(
			expect.objectContaining({
				provider: "claude-code",
				authMethod: "oauth",
				accountName: "claude-code-oauth-account",
			}),
		);

		const codexInitResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/codex/init",
			{
				name: "codex-oauth-account",
			},
		);
		expect(codexInitResponse.status).toBe(200);

		const codexInitBody = (await codexInitResponse.json()) as {
			data: { authUrl: string; sessionId: string };
		};
		expect(codexInitBody.data.authUrl).toContain("https://auth.openai.com");
		expect(
			new URL(codexInitBody.data.authUrl).searchParams.get("client_id"),
		).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
		expect(
			new URL(codexInitBody.data.authUrl).searchParams.get("redirect_uri"),
		).toBe("http://localhost:1455/auth/callback");
		expect(dbOps.getAuthSession(codexInitBody.data.sessionId)).toEqual(
			expect.objectContaining({
				provider: "codex",
				authMethod: "oauth",
				accountName: "codex-oauth-account",
			}),
		);

		const completeResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/codex/complete",
			{
				sessionId: crypto.randomUUID(),
				code: "fake-code",
			},
		);
		expect(completeResponse.status).toBe(400);
		expect((await completeResponse.json()) as { error: string }).toEqual(
			expect.objectContaining({
				error: expect.stringContaining("session expired or invalid"),
			}),
		);

		const unknownProvider = await apiRequest(
			router,
			"POST",
			"/api/auth/gemini/init",
			{
				name: "unsupported-account",
			},
		);
		expect([400, 404]).toContain(unknownProvider.status);
	});

	it("starts localhost OAuth callback forwarders for providers that need them", async () => {
		const { router } = createRouterContext();

		const codexInitResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/codex/init",
			{
				name: "codex-forwarder-account",
			},
		);
		expect(codexInitResponse.status).toBe(200);

		const codexInitBody = (await codexInitResponse.json()) as {
			data: { authUrl: string };
		};
		const codexState = new URL(codexInitBody.data.authUrl).searchParams.get(
			"state",
		);
		expect(codexState).toBeTruthy();

		const codexForwardResponse = await fetch(
			`http://127.0.0.1:1455/auth/callback?code=codex-code&state=${codexState}&foo=bar`,
			{
				redirect: "manual",
			},
		);
		expect(codexForwardResponse.status).toBe(302);
		expect(codexForwardResponse.headers.get("location")).toBe(
			`http://localhost:8080/oauth/codex/callback?code=codex-code&state=${codexState}&foo=bar`,
		);
	});

	it("auto-completes OAuth callbacks via state lookup and reports completed session status", async () => {
		const { router, dbOps } = createRouterContext();

		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = new Request(input, init);
				expect(request.url).toBe("https://auth.openai.com/oauth/token");
				expect(await request.text()).toContain("code=callback-code");

				return new Response(
					JSON.stringify({
						access_token: "callback-access-token",
						refresh_token: "callback-refresh-token",
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

		const initResponse = await apiRequest(
			router,
			"POST",
			"/api/auth/codex/init",
			{
				name: "callback-account",
			},
		);
		expect(initResponse.status).toBe(200);

		const initBody = (await initResponse.json()) as {
			data: { authUrl: string; sessionId: string };
		};
		const state = new URL(initBody.data.authUrl).searchParams.get("state");
		expect(state).toBeTruthy();

		const pendingStatusResponse = await apiRequest(
			router,
			"GET",
			`/api/auth/session/${initBody.data.sessionId}/status`,
		);
		expect(pendingStatusResponse.status).toBe(200);
		expect((await pendingStatusResponse.json()) as { status: string }).toEqual({
			status: "pending",
		});

		const callbackResponse = await router.handleRequest(
			new URL(
				`http://localhost:8080/oauth/codex/callback?code=callback-code&state=${state}`,
			),
			new Request(
				`http://localhost:8080/oauth/codex/callback?code=callback-code&state=${state}`,
			),
		);
		expect(callbackResponse).not.toBeNull();
		expect(callbackResponse?.status).toBe(200);
		expect(callbackResponse?.headers.get("content-type")).toContain(
			"text/html",
		);
		expect(await (callbackResponse as Response).text()).toContain(
			"Account connected",
		);

		const completedStatusResponse = await apiRequest(
			router,
			"GET",
			`/api/auth/session/${initBody.data.sessionId}/status`,
		);
		expect(completedStatusResponse.status).toBe(200);
		expect(
			(await completedStatusResponse.json()) as { status: string },
		).toEqual({ status: "completed" });

		expect(dbOps.getAllAccounts()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "callback-account",
					provider: "codex",
					auth_method: "oauth",
				}),
			]),
		);

		const expiredStatusResponse = await apiRequest(
			router,
			"GET",
			`/api/auth/session/${crypto.randomUUID()}/status`,
		);
		expect(expiredStatusResponse.status).toBe(200);
		expect((await expiredStatusResponse.json()) as { status: string }).toEqual({
			status: "expired",
		});
	});

	it("returns an HTML error page when an OAuth callback state is invalid", async () => {
		const router = createRouter();

		const response = await router.handleRequest(
			new URL(
				"http://localhost:8080/oauth/codex/callback?code=bad-code&state=missing-state",
			),
			new Request(
				"http://localhost:8080/oauth/codex/callback?code=bad-code&state=missing-state",
			),
		);

		expect(response).not.toBeNull();
		expect(response?.status).toBe(400);
		expect(response?.headers.get("content-type")).toContain("text/html");
		expect(await (response as Response).text()).toContain(
			"Authorization failed",
		);
	});

	it("returns an SSE response for log streaming", async () => {
		const router = createRouter();
		const response = await apiRequest(router, "GET", "/api/logs/stream");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
	});
});
