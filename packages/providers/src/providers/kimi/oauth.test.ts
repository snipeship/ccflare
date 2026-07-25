import { afterEach, describe, expect, it } from "bun:test";
import {
	KIMI_OAUTH_CLIENT_ID,
	KIMI_OAUTH_DEVICE_AUTHORIZATION_URL,
	KIMI_OAUTH_TOKEN_URL,
	KimiOAuthProvider,
} from "./oauth";

const originalFetch = globalThis.fetch;

function mockFetch(
	handler: (request: Request) => Promise<Response> | Response,
): void {
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) =>
			handler(new Request(input, init)),
		{ preconnect: originalFetch.preconnect },
	) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("KimiOAuthProvider", () => {
	it("requests a device authorization and returns the verification URL", async () => {
		const provider = new KimiOAuthProvider();
		mockFetch(async (request) => {
			expect(request.url).toBe(KIMI_OAUTH_DEVICE_AUTHORIZATION_URL);
			expect(await request.text()).toBe(`client_id=${KIMI_OAUTH_CLIENT_ID}`);
			return jsonResponse({
				device_code: "device-code-1",
				user_code: "ABCD-1234",
				verification_uri: "https://www.kimi.com/code/authorize_device",
				verification_uri_complete:
					"https://www.kimi.com/code/authorize_device?user_code=ABCD-1234",
				expires_in: 1800,
				interval: 5,
			});
		});

		const device = await provider.beginDeviceAuthorization(
			provider.getOAuthConfig(),
		);

		expect(device.deviceCode).toBe("device-code-1");
		expect(device.userCode).toBe("ABCD-1234");
		expect(device.verificationUriComplete).toContain("user_code=ABCD-1234");
		expect(device.interval).toBe(5);
		expect(device.expiresAt).toBeGreaterThan(Date.now());
	});

	it("polls the token endpoint past authorization_pending until tokens arrive", async () => {
		const provider = new KimiOAuthProvider(1);
		let calls = 0;
		mockFetch(async (request) => {
			calls += 1;
			expect(request.url).toBe(KIMI_OAUTH_TOKEN_URL);
			const body = await request.text();
			expect(body).toContain("device_code=device-code-1");
			expect(body).toContain(
				"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
			);

			if (calls === 1) {
				return jsonResponse({ error: "authorization_pending" }, 400);
			}
			return jsonResponse({
				access_token: "kimi-access",
				refresh_token: "kimi-refresh",
				expires_in: 900,
			});
		});

		const tokens = await provider.exchangeCode(
			"",
			"device-code-1",
			provider.getOAuthConfig(),
		);

		expect(calls).toBe(2);
		expect(tokens.accessToken).toBe("kimi-access");
		expect(tokens.refreshToken).toBe("kimi-refresh");
		expect(tokens.expiresAt).toBeGreaterThan(Date.now());
	});

	it("fails fast when the device authorization is denied", async () => {
		const provider = new KimiOAuthProvider(1);
		mockFetch(() => jsonResponse({ error: "access_denied" }, 400));

		await expect(
			provider.exchangeCode("", "device-code-1", provider.getOAuthConfig()),
		).rejects.toThrow(/denied/i);
	});
});
