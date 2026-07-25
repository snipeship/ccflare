import { describe, expect, it } from "bun:test";
import {
	type Account,
	getAccountRateLimitInfo,
	getAccountSessionInfo,
} from "./account";
import { ACCOUNT_PROVIDERS } from "./provider-metadata";

describe("toAccount", () => {
	it("exports all supported providers", () => {
		expect(ACCOUNT_PROVIDERS).toEqual([
			"anthropic",
			"openai",
			"claude-code",
			"codex",
			"kimi",
		]);
	});

	it("derives structured rate limit and session facts from account models", () => {
		const now = Date.now();
		const account: Account = {
			id: "account-2",
			name: "Anthropic OAuth",
			provider: "claude-code",
			auth_method: "oauth",
			base_url: null,
			api_key: null,
			refresh_token: "refresh-token",
			access_token: "access-token",
			expires_at: now + 60_000,
			created_at: now - 10_000,
			last_used: now - 5_000,
			request_count: 3,
			total_requests: 11,
			rate_limited_until: now + 120_000,
			session_start: now - 60_000,
			session_request_count: 4,
			weight: 1,
			paused: false,
			rate_limit_reset: now + 180_000,
			rate_limit_status: "allowed_warning",
			rate_limit_remaining: 2,
		};

		expect(getAccountRateLimitInfo(account, now)).toEqual({
			code: "allowed_warning",
			isLimited: true,
			until: now + 120_000,
			resetAt: now + 180_000,
			remaining: 2,
		});
		expect(getAccountSessionInfo(account)).toEqual({
			active: true,
			startedAt: now - 60_000,
			requestCount: 4,
		});
	});
});
