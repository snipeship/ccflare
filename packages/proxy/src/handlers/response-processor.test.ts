import { describe, expect, it } from "bun:test";
import type { Account } from "@ccflare/types";
import type { ResolvedProxyContext } from "./proxy-types";
import {
	isRetryableUpstreamError,
	parseRetryAfter,
	processProxyResponse,
} from "./response-processor";

function makeResponse(status: number, shouldRetry?: string): Response {
	const headers = new Headers();
	if (shouldRetry !== undefined) {
		headers.set("x-should-retry", shouldRetry);
	}
	return new Response(null, { status, headers });
}

function createAccount(): Account {
	return {
		id: "account-1",
		name: "primary",
		provider: "openai",
		auth_method: "api_key",
		base_url: null,
		api_key: "sk-test",
		refresh_token: null,
		access_token: null,
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
	};
}

function createContext(rateLimitInfo: {
	isRateLimited: boolean;
	statusHeader?: string;
	resetTime?: number | null;
	remaining?: number | null;
}) {
	const calls: string[] = [];
	const queued: Array<() => void> = [];
	const ctx = {
		provider: {
			name: "openai",
			defaultBaseUrl: "https://api.openai.com/v1",
			buildUrl() {
				return "https://api.openai.com/v1/chat/completions";
			},
			prepareHeaders(headers: Headers) {
				return new Headers(headers);
			},
			parseRateLimit() {
				return rateLimitInfo;
			},
			async processResponse(response: Response) {
				return response;
			},
		},
		asyncWriter: {
			enqueue(task: () => void) {
				queued.push(task);
			},
		},
		dbOps: {
			updateAccountUsage() {
				calls.push("updateAccountUsage");
			},
			updateAccountRateLimitMeta() {
				calls.push("updateAccountRateLimitMeta");
			},
			markAccountRateLimited() {
				calls.push("markAccountRateLimited");
			},
		},
	} as unknown as ResolvedProxyContext;

	return {
		ctx,
		calls,
		flush() {
			for (const task of queued) {
				task();
			}
		},
	};
}

describe("isRetryableUpstreamError", () => {
	it("treats 529 with x-should-retry=true as retryable", () => {
		expect(isRetryableUpstreamError(makeResponse(529, "true"))).toBe(true);
	});

	it("treats 503 with x-should-retry=true as retryable", () => {
		expect(isRetryableUpstreamError(makeResponse(503, "true"))).toBe(true);
	});

	it("treats 502 with x-should-retry=true as retryable", () => {
		expect(isRetryableUpstreamError(makeResponse(502, "true"))).toBe(true);
	});

	it("does not retry 529 without the header", () => {
		expect(isRetryableUpstreamError(makeResponse(529))).toBe(false);
	});

	it("does not retry 500 with x-should-retry=false", () => {
		expect(isRetryableUpstreamError(makeResponse(500, "false"))).toBe(false);
	});

	it("does not retry 200 even with x-should-retry=true (status < 500)", () => {
		expect(isRetryableUpstreamError(makeResponse(200, "true"))).toBe(false);
	});

	it("does not retry 429 with x-should-retry=true (rate-limit owns this path)", () => {
		expect(isRetryableUpstreamError(makeResponse(429, "true"))).toBe(false);
	});
});

describe("parseRetryAfter", () => {
	function makeRetryAfterResponse(value?: string): Response {
		const headers = new Headers();
		if (value !== undefined) {
			headers.set("retry-after", value);
		}
		return new Response(null, { status: 503, headers });
	}

	it("parses integer seconds", () => {
		expect(parseRetryAfter(makeRetryAfterResponse("30"))).toBe(30_000);
	});

	it("parses decimal seconds", () => {
		expect(parseRetryAfter(makeRetryAfterResponse("0.5"))).toBe(500);
	});

	it("parses an HTTP date in the future as a positive ms delta", () => {
		const futureMs = Date.now() + 60_000;
		const httpDate = new Date(futureMs).toUTCString();
		const result = parseRetryAfter(makeRetryAfterResponse(httpDate));
		expect(result).toBeDefined();
		// HTTP-date format (toUTCString) is second-precision so the parsed
		// value rounds down to the nearest second, and there is additional
		// scheduling slack between `futureMs` and the `Date.now()` call
		// inside parseRetryAfter. Allow up to one full second of drift.
		expect(Math.abs((result as number) - 60_000)).toBeLessThanOrEqual(1_050);
	});

	it("clamps an HTTP date in the past to 0 rather than returning a negative value", () => {
		const pastMs = Date.now() - 60_000;
		const httpDate = new Date(pastMs).toUTCString();
		expect(parseRetryAfter(makeRetryAfterResponse(httpDate))).toBe(0);
	});

	it("returns undefined when the header is absent", () => {
		expect(parseRetryAfter(makeRetryAfterResponse())).toBeUndefined();
	});

	it("returns undefined for unparseable garbage", () => {
		expect(
			parseRetryAfter(makeRetryAfterResponse("not-a-date-or-number")),
		).toBeUndefined();
	});
});

describe("processProxyResponse", () => {
	it("keeps successful response processing limited to rate-limit metadata updates", () => {
		const account = createAccount();
		const { ctx, calls, flush } = createContext({
			isRateLimited: false,
			statusHeader: "allowed",
			resetTime: 1_710_000_000_000,
			remaining: 17,
		});

		const isRateLimited = processProxyResponse(
			new Response("ok", { status: 200 }),
			account,
			ctx,
		);
		flush();

		expect(isRateLimited).toBe(false);
		expect(calls).toEqual(["updateAccountRateLimitMeta"]);
	});

	it("does not increment account usage when rejecting a rate-limited response", () => {
		const account = createAccount();
		const { ctx, calls, flush } = createContext({
			isRateLimited: true,
			statusHeader: "rate_limited",
			resetTime: 1_710_000_000_000,
			remaining: 0,
		});

		const isRateLimited = processProxyResponse(
			new Response("rate limited", { status: 429 }),
			account,
			ctx,
		);
		flush();

		expect(isRateLimited).toBe(true);
		expect(calls).toEqual([
			"markAccountRateLimited",
			"updateAccountRateLimitMeta",
		]);
	});
});
