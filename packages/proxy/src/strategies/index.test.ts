import { beforeEach, describe, expect, it } from "bun:test";
import type { Account, RequestMeta, StrategyStore } from "@ccflare/types";
import {
	clearRefreshFailure,
	recordRefreshFailure,
} from "../handlers/refresh-backoff";
import { SessionStrategy } from "./index";

function createAccount(overrides: Partial<Account> = {}): Account {
	return {
		id: "account",
		name: "account",
		provider: "anthropic",
		auth_method: "oauth",
		base_url: null,
		api_key: null,
		refresh_token: "refresh",
		access_token: "access",
		expires_at: null,
		request_count: 0,
		total_requests: 0,
		last_used: null,
		created_at: 0,
		rate_limited_until: null,
		session_start: null,
		session_request_count: 0,
		weight: 1,
		paused: false,
		rate_limit_reset: null,
		rate_limit_status: null,
		rate_limit_remaining: null,
		...overrides,
	};
}

const meta: RequestMeta = {
	id: "req-1",
	method: "POST",
	path: "/v1/messages",
	timestamp: 0,
};

function createStore(): StrategyStore {
	return {
		resetAccountSession(accountId: string, timestamp: number) {
			void accountId;
			void timestamp;
		},
	};
}

describe("SessionStrategy refresh-backoff awareness", () => {
	beforeEach(() => {
		clearRefreshFailure("team");
		clearRefreshFailure("personal");
	});

	it("skips an active account that is in refresh backoff and fails over", () => {
		const now = Date.now();
		const team = createAccount({
			id: "team",
			name: "team",
			session_start: now, // active session
		});
		const personal = createAccount({ id: "personal", name: "personal" });

		// Team's token refresh just failed -> it is in the backoff window.
		recordRefreshFailure("team", now);

		const strategy = new SessionStrategy();
		strategy.initialize(createStore());
		const ordered = strategy.select([team, personal], meta);

		expect(ordered[0]?.id).toBe("personal");
		expect(ordered.some((a) => a.id === "team")).toBe(false);
	});

	it("uses the active account again once its backoff has elapsed", () => {
		const now = Date.now();
		const team = createAccount({
			id: "team",
			name: "team",
			session_start: now,
		});
		const personal = createAccount({ id: "personal", name: "personal" });

		// A failure that happened well outside the backoff window is self-healed.
		recordRefreshFailure("team", now - 70_000);

		const strategy = new SessionStrategy();
		strategy.initialize(createStore());
		const ordered = strategy.select([team, personal], meta);

		expect(ordered[0]?.id).toBe("team");
	});
});
