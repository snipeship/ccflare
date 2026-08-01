import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseOperations } from "./database-operations";

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop() as string, { force: true, recursive: true });
	}
});

describe("DatabaseOperations", () => {
	it("enables foreign key enforcement during initialization", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "ccflare-db-ops-"));
		tempDirs.push(tempDir);

		const dbOps = new DatabaseOperations(join(tempDir, "ccflare.db"));

		try {
			const pragma = dbOps.getDatabase().query("PRAGMA foreign_keys").get() as {
				foreign_keys: 0 | 1;
			} | null;

			expect(pragma?.foreign_keys).toBe(1);
		} finally {
			dbOps.close();
		}
	});

	it("lists request summaries with account names and preserves zero-valued usage", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "ccflare-db-ops-"));
		tempDirs.push(tempDir);

		const dbOps = new DatabaseOperations(join(tempDir, "ccflare.db"));

		try {
			const account = dbOps.createAccount({
				name: "summary-owner",
				provider: "openai",
				auth_method: "api_key",
				api_key: "sk-test",
			});

			dbOps.saveRequest(
				"request-zero",
				"POST",
				"/v1/openai/responses",
				"openai",
				"/responses",
				account.id,
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

			expect(dbOps.listRequestSummaries(1)).toEqual([
				expect.objectContaining({
					id: "request-zero",
					accountUsed: account.id,
					accountName: "summary-owner",
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
		} finally {
			dbOps.close();
		}
	});

	it("loads one request detail row by exact stored id", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "ccflare-db-ops-"));
		tempDirs.push(tempDir);
		const dbOps = new DatabaseOperations(join(tempDir, "ccflare.db"));

		try {
			for (const id of ["selected", "other"]) {
				dbOps.saveRequestMeta(
					id,
					"POST",
					`/${id}`,
					"openai",
					`/${id}`,
					null,
					200,
				);
				dbOps.saveRequestPayload(id, {
					id,
					request: { headers: {}, body: `${id}-body` },
				});
			}

			expect(dbOps.getRequestDetailRow("selected")).toMatchObject({
				id: "selected",
				payload_json: expect.stringContaining("selected-body"),
			});
			expect(dbOps.getRequestDetailRow("selected")?.payload_json).not.toContain(
				"other-body",
			);
			expect(dbOps.getRequestDetailRow("missing")).toBeNull();
		} finally {
			dbOps.close();
		}
	});

	it("aggregates analytics through the repository facade", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "ccflare-db-ops-"));
		tempDirs.push(tempDir);

		const dbOps = new DatabaseOperations(join(tempDir, "ccflare.db"));

		try {
			const db = dbOps.getDatabase();
			const account = dbOps.createAccount({
				name: "analytics-owner",
				provider: "openai",
				auth_method: "api_key",
				api_key: "sk-test",
			});
			const now = Date.now();

			db.run(
				`
					INSERT INTO requests (
						id,
						timestamp,
						method,
						path,
						provider,
						upstream_path,
						account_used,
						status_code,
						success,
						error_message,
						response_time_ms,
						failover_attempts,
						model,
						prompt_tokens,
						completion_tokens,
						total_tokens,
						cost_usd,
						input_tokens,
						cache_read_input_tokens,
						cache_creation_input_tokens,
						output_tokens,
						reasoning_tokens,
						output_tokens_per_second
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				[
					"analytics-success",
					now - 1_000,
					"POST",
					"/v1/openai/responses",
					"openai",
					"/responses",
					account.id,
					200,
					1,
					null,
					125,
					0,
					"gpt-4o-mini",
					4,
					6,
					10,
					1.5,
					4,
					0,
					0,
					6,
					0,
					12,
				],
			);
			db.run(
				`
					INSERT INTO requests (
						id,
						timestamp,
						method,
						path,
						provider,
						upstream_path,
						account_used,
						status_code,
						success,
						error_message,
						response_time_ms,
						failover_attempts,
						model,
						prompt_tokens,
						completion_tokens,
						total_tokens,
						cost_usd,
						input_tokens,
						cache_read_input_tokens,
						cache_creation_input_tokens,
						output_tokens,
						reasoning_tokens,
						output_tokens_per_second
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				[
					"analytics-failure",
					now - 500,
					"POST",
					"/v1/openai/responses",
					"openai",
					"/responses",
					account.id,
					429,
					0,
					"rate limited",
					250,
					1,
					"gpt-4o-mini",
					1,
					1,
					2,
					0.2,
					1,
					0,
					0,
					1,
					0,
					4,
				],
			);

			const analytics = dbOps.getAnalytics({
				startMs: now - 10_000,
				bucketMs: 1_000,
			});

			expect(analytics.totals).toEqual(
				expect.objectContaining({
					requests: 2,
					activeAccounts: 1,
					totalTokens: 12,
					totalCostUsd: 1.7,
				}),
			);
			expect(analytics.modelDistribution).toEqual([
				{ model: "gpt-4o-mini", count: 2 },
			]);
			expect(analytics.accountPerformance).toEqual([
				expect.objectContaining({
					name: "analytics-owner",
					requests: 2,
					successRate: 50,
				}),
			]);
			expect(analytics.providerBreakdown).toEqual([
				expect.objectContaining({
					provider: "openai",
					requests: 2,
					totalTokens: 12,
					totalCostUsd: 1.7,
				}),
			]);
		} finally {
			dbOps.close();
		}
	});

	it("resets statistics consistently through the shared facade helper", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "ccflare-db-ops-"));
		tempDirs.push(tempDir);

		const dbOps = new DatabaseOperations(join(tempDir, "ccflare.db"));

		try {
			const account = dbOps.createAccount({
				name: "stats-owner",
				provider: "anthropic",
				auth_method: "api_key",
				api_key: "sk-test",
			});

			dbOps.updateAccountUsage(account.id);
			dbOps.saveRequest(
				"request-one",
				"POST",
				"/v1/anthropic/v1/messages",
				"anthropic",
				"/v1/messages",
				account.id,
				200,
				true,
				null,
				10,
				0,
			);

			expect(dbOps.getRecentRequests(10)).toHaveLength(1);
			expect(dbOps.getAccount(account.id)?.request_count).toBe(1);

			dbOps.resetStats();

			const resetAccount = dbOps.getAccount(account.id);
			expect(resetAccount?.request_count).toBe(0);
			expect(resetAccount?.session_request_count).toBe(0);
			expect(resetAccount?.session_start).toBeNull();

			expect(dbOps.getRecentRequests(10)).toHaveLength(0);
		} finally {
			dbOps.close();
		}
	});
});
