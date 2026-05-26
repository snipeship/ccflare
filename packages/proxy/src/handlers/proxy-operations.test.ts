import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Account, RequestMeta } from "@ccflare/types";
import { waitForProxyBackgroundTasks } from "../background-tasks";
import type { StartMessage } from "../worker-messages";
import { proxyWithAccount } from "./proxy-operations";
import type { ResolvedProxyContext } from "./proxy-types";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	mock.restore();
});

function createAccount(): Account {
	return {
		id: "account-1",
		name: "primary",
		provider: "anthropic",
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

interface TestContext {
	ctx: ResolvedProxyContext;
	workerMessages: unknown[];
}

function createContext(
	retry: { attempts: number; delayMs: number; backoff: number } = {
		attempts: 3,
		delayMs: 0,
		backoff: 1,
	},
): TestContext {
	const workerMessages: unknown[] = [];
	const ctx = {
		provider: {
			name: "anthropic",
			defaultBaseUrl: "https://api.anthropic.com",
			buildUrl() {
				return "https://api.anthropic.com/v1/messages";
			},
			prepareHeaders(headers: Headers) {
				return new Headers(headers);
			},
			parseRateLimit() {
				return { isRateLimited: false };
			},
			isStreamingResponse() {
				return false;
			},
			async processResponse(response: Response) {
				return response;
			},
		},
		providerName: "anthropic",
		upstreamPath: "/v1/messages",
		strategy: {
			select(accounts: Account[]) {
				return accounts;
			},
		},
		dbOps: {
			updateAccountRateLimitMeta() {},
			markAccountRateLimited() {},
		},
		runtime: {
			clientId: "test-client",
			retry,
			sessionDurationMs: 0,
			port: 8080,
		},
		refreshInFlight: new Map(),
		asyncWriter: {
			enqueue() {},
		},
		usageWorker: {
			postMessage(msg: unknown) {
				workerMessages.push(msg);
			},
		},
	} as unknown as ResolvedProxyContext;
	return { ctx, workerMessages };
}

function startMessageFrom(messages: unknown[]): StartMessage {
	const start = messages.find(
		(m): m is StartMessage =>
			typeof m === "object" &&
			m !== null &&
			(m as { type?: string }).type === "start",
	);
	if (!start) {
		throw new Error("expected a 'start' worker message");
	}
	return start;
}

function createRequestMeta(): RequestMeta {
	return {
		id: "req-1",
		method: "POST",
		path: "/v1/anthropic/v1/messages",
		timestamp: Date.now(),
	};
}

function retryableResponse(
	status = 529,
	extraHeaders?: Record<string, string>,
): Response {
	return new Response("overloaded", {
		status,
		headers: { "x-should-retry": "true", ...extraHeaders },
	});
}

async function invokeProxy(testCtx: TestContext): Promise<Response | null> {
	const account = createAccount();
	const req = new Request("http://localhost:8080/v1/anthropic/v1/messages", {
		method: "POST",
	});
	const url = new URL("http://localhost:8080/v1/anthropic/v1/messages");
	const result = await proxyWithAccount(
		req,
		url,
		account,
		createRequestMeta(),
		null,
		() => undefined,
		0,
		testCtx.ctx,
	);
	// Drain any background analytics work so afterEach can restore globals
	// without racing against in-flight tasks.
	await waitForProxyBackgroundTasks();
	return result;
}

describe("proxyWithAccount retry loop", () => {
	it("retries on x-should-retry until upstream succeeds", async () => {
		const responses = [
			retryableResponse(529),
			retryableResponse(529),
			retryableResponse(529),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const response = await invokeProxy(createContext());

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(response).not.toBeNull();
		expect(response?.status).toBe(200);
	});

	it("returns null after exhausting retries when upstream keeps signaling retry", async () => {
		const fetchMock = mock(() => Promise.resolve(retryableResponse(529)));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const response = await invokeProxy(createContext());

		// attempts=3 means 1 initial + 3 retries = 4 calls before failover.
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(response).toBeNull();
	});

	it("does not retry a 500 without the x-should-retry header", async () => {
		const upstream = new Response("server error", { status: 500 });
		const fetchMock = mock(() => Promise.resolve(upstream));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const response = await invokeProxy(createContext());

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(response).not.toBeNull();
		expect(response?.status).toBe(500);
	});

	it("forwards a 200 immediately without retrying", async () => {
		const upstream = new Response("hello", { status: 200 });
		const fetchMock = mock(() => Promise.resolve(upstream));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const response = await invokeProxy(createContext());

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(response).not.toBeNull();
		expect(response?.status).toBe(200);
	});

	it("honors a smaller configured retry budget", async () => {
		const fetchMock = mock(() => Promise.resolve(retryableResponse(503)));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const response = await invokeProxy(
			createContext({ attempts: 1, delayMs: 0, backoff: 1 }),
		);

		// attempts=1 -> 1 initial + 1 retry = 2 calls total.
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(response).toBeNull();
	});

	it("waits between retries using configured backoff", async () => {
		const responses = [
			retryableResponse(529),
			retryableResponse(529),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		// Pin Math.random to its upper bound so jitter degenerates to the
		// base delay and we can assert on a deterministic floor.
		const originalRandom = Math.random;
		Math.random = () => 1;
		try {
			const start = Date.now();
			const response = await invokeProxy(
				createContext({ attempts: 3, delayMs: 25, backoff: 2 }),
			);
			const elapsed = Date.now() - start;

			// Expected waits with Math.random()=1: attempt 0 -> 25ms,
			// attempt 1 -> 50ms => >= 75ms total.
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(response?.status).toBe(200);
			expect(elapsed).toBeGreaterThanOrEqual(70);
		} finally {
			Math.random = originalRandom;
		}
	});

	it("tracks retry count when retries occur and propagates it to the worker", async () => {
		// Mirrors the live-diagnosis scenario: two 529 + x-should-retry rounds
		// before a 200. Operators rely on the `retry_attempt` column to find
		// requests rescued by the same-account retry path
		// (`WHERE retry_attempt > 0`); the worker's start message is the
		// transport that carries the value from the proxy into the DB write,
		// so we assert on it directly.
		const responses = [
			retryableResponse(529),
			retryableResponse(529),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const testCtx = createContext();
		const response = await invokeProxy(testCtx);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(response?.status).toBe(200);
		expect(startMessageFrom(testCtx.workerMessages).retryAttempt).toBe(2);
	});

	it("reports retryAttempt=0 when the first response is acceptable", async () => {
		// Negative control: without this, a regression that hardcodes
		// retryAttempt to a non-zero value would still satisfy the test above.
		const fetchMock = mock(() =>
			Promise.resolve(new Response("ok", { status: 200 })),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const testCtx = createContext();
		await invokeProxy(testCtx);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(startMessageFrom(testCtx.workerMessages).retryAttempt).toBe(0);
	});

	it("applies full jitter to the configured backoff", async () => {
		// Pin Math.random=0.5 -> jitter halves the base delay. Without the
		// jitter change this test would observe ~75ms (25 + 50); with jitter
		// it should be ~half of that.
		const responses = [
			retryableResponse(529),
			retryableResponse(529),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const originalRandom = Math.random;
		Math.random = () => 0.5;
		try {
			const start = Date.now();
			const response = await invokeProxy(
				createContext({ attempts: 3, delayMs: 100, backoff: 2 }),
			);
			const elapsed = Date.now() - start;

			// Base delays: 100ms, 200ms. With Math.random=0.5 jittered values
			// are 50ms + 100ms = 150ms total. Allow generous upper slack for
			// fetch + worker scheduling but require we sat well below the
			// un-jittered floor (300ms).
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(response?.status).toBe(200);
			expect(elapsed).toBeGreaterThanOrEqual(140);
			expect(elapsed).toBeLessThan(260);
		} finally {
			Math.random = originalRandom;
		}
	});

	it("honors retry-after as a floor when it exceeds the jittered backoff", async () => {
		// Upstream asks for a 1s retry-after but our configured delay is
		// only 10ms. The retry-after must override.
		const responses = [
			retryableResponse(529, { "retry-after": "1" }),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const start = Date.now();
		const response = await invokeProxy(
			createContext({ attempts: 3, delayMs: 10, backoff: 1 }),
		);
		const elapsed = Date.now() - start;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(response?.status).toBe(200);
		// retry-after: 1 second. Allow a tiny scheduling slack below the
		// nominal value but require the wait to be far above the 10ms
		// configured delay.
		expect(elapsed).toBeGreaterThanOrEqual(950);
	});

	it("caps the base delay at MAX_BACKOFF_MS (30s) even with an aggressive config", async () => {
		// With delayMs=1000, backoff=2, attempt=10 the un-capped base would
		// be 1_024_000ms. We force Math.random=1 so the jitter degenerates
		// to the base, then assert the observed wait fits inside the cap.
		const responses = [
			retryableResponse(529),
			new Response("ok", { status: 200 }),
		];
		const fetchMock = mock(() =>
			Promise.resolve(responses.shift() as Response),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const originalRandom = Math.random;
		Math.random = () => 1;
		try {
			const start = Date.now();
			// Use a fairly conservative attempt-count so the test completes
			// in ~30s rather than minutes. attempt=0 with delayMs=1000 and
			// backoff=2 hits the cap if we crank delayMs high enough; pick
			// delayMs=60_000 so the un-capped delay (60s) exceeds the cap.
			const response = await invokeProxy(
				createContext({ attempts: 1, delayMs: 60_000, backoff: 2 }),
			);
			const elapsed = Date.now() - start;

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(response?.status).toBe(200);
			// Should wait around 30s (the cap), not 60s (the un-capped base).
			// Allow generous upper slack for scheduling and fetch overhead.
			expect(elapsed).toBeGreaterThanOrEqual(29_500);
			expect(elapsed).toBeLessThan(35_000);
		} finally {
			Math.random = originalRandom;
		}
	}, 40_000);
});
