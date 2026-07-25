import { OAuthError } from "@ccflare/core";
import type {
	DeviceAuthorization,
	OAuthProvider,
	OAuthProviderConfig,
	TokenResult,
} from "../../types";

export const KIMI_OAUTH_HOST = "https://auth.kimi.com";
export const KIMI_OAUTH_DEVICE_AUTHORIZATION_URL = `${KIMI_OAUTH_HOST}/api/oauth/device_authorization`;
export const KIMI_OAUTH_TOKEN_URL = `${KIMI_OAUTH_HOST}/api/oauth/token`;
export const KIMI_OAUTH_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
export const KIMI_DEVICE_GRANT_TYPE =
	"urn:ietf:params:oauth:grant-type:device_code";

/** Fallback poll interval when the authorization server omits one. */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
/**
 * Upper bound on a single `exchangeCode` poll loop. The device code itself is
 * valid for 30 minutes, but `complete` is called from an HTTP handler, so the
 * loop is capped well below any sane request timeout.
 */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

interface DeviceAuthorizationResponse {
	device_code?: string;
	user_code?: string;
	verification_uri?: string;
	verification_uri_complete?: string;
	expires_in?: number;
	interval?: number;
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	expires_at?: number;
	error?: string;
	error_description?: string;
}

async function postForm(
	url: string,
	body: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
	});

	let json: Record<string, unknown> = {};
	try {
		json = (await response.json()) as Record<string, unknown>;
	} catch {
		// Non-JSON payloads surface via the status code alone.
	}

	return { status: response.status, json };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kimi Code OAuth, which uses the device authorization grant rather than a
 * redirect + PKCE exchange. The user approves in a browser and the token
 * endpoint is polled until it returns tokens; nothing is pasted back.
 */
export class KimiOAuthProvider implements OAuthProvider {
	/**
	 * `pollIntervalMs` is overridable so tests do not wait real seconds. The
	 * server's advertised interval is not plumbed through `exchangeCode`, which
	 * only receives the device code.
	 */
	constructor(
		private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_SECONDS * 1000,
	) {}

	getOAuthConfig(): OAuthProviderConfig {
		return {
			authorizeUrl: KIMI_OAUTH_DEVICE_AUTHORIZATION_URL,
			tokenUrl: KIMI_OAUTH_TOKEN_URL,
			clientId: KIMI_OAUTH_CLIENT_ID,
			scopes: [],
			// Device flow never redirects anywhere.
			redirectUri: "",
		};
	}

	generateAuthUrl(): string {
		throw new OAuthError(
			"Kimi uses the OAuth device authorization grant; call beginDeviceAuthorization instead.",
			"kimi",
		);
	}

	async beginDeviceAuthorization(
		config: OAuthProviderConfig,
	): Promise<DeviceAuthorization> {
		const { status, json } = await postForm(config.authorizeUrl, {
			client_id: config.clientId,
		});

		if (status !== 200) {
			const error = json as TokenResponse;
			throw new OAuthError(
				error.error_description ||
					error.error ||
					`Device authorization failed (HTTP ${status})`,
				"kimi",
				error.error,
			);
		}

		const data = json as DeviceAuthorizationResponse;
		if (!data.device_code || !data.user_code) {
			throw new OAuthError(
				"Device authorization response missing device_code or user_code",
				"kimi",
			);
		}

		const verificationUri = data.verification_uri ?? "";
		return {
			deviceCode: data.device_code,
			userCode: data.user_code,
			verificationUri,
			verificationUriComplete:
				data.verification_uri_complete ?? verificationUri,
			interval: data.interval ?? DEFAULT_POLL_INTERVAL_SECONDS,
			expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000,
		};
	}

	/**
	 * Polls the token endpoint with the device code. `code` is unused: the
	 * device grant has no user-supplied authorization code, and the device code
	 * arrives via `verifier` (where the OAuth flow persists it).
	 */
	async exchangeCode(
		_code: string,
		verifier: string,
		config: OAuthProviderConfig,
	): Promise<TokenResult> {
		if (!verifier) {
			throw new OAuthError("Missing device code for Kimi OAuth flow", "kimi");
		}

		const deadline = Date.now() + MAX_POLL_DURATION_MS;
		let intervalMs = this.pollIntervalMs;

		while (Date.now() < deadline) {
			const { status, json } = await postForm(config.tokenUrl, {
				client_id: config.clientId,
				device_code: verifier,
				grant_type: KIMI_DEVICE_GRANT_TYPE,
			});
			const data = json as TokenResponse;

			if (status === 200 && data.access_token) {
				return {
					accessToken: data.access_token,
					refreshToken: data.refresh_token ?? "",
					expiresAt:
						data.expires_at ?? Date.now() + (data.expires_in ?? 900) * 1000,
				};
			}

			if (status >= 500) {
				throw new OAuthError(
					`Kimi token polling server error (HTTP ${status})`,
					"kimi",
				);
			}

			switch (data.error) {
				case "authorization_pending":
					break;
				case "slow_down":
					intervalMs += 5000;
					break;
				case "expired_token":
					throw new OAuthError(
						"Device authorization expired before it was approved. Please try again.",
						"kimi",
						data.error,
					);
				case "access_denied":
					throw new OAuthError(
						"Device authorization was denied.",
						"kimi",
						data.error,
					);
				default:
					throw new OAuthError(
						data.error_description ||
							data.error ||
							`Kimi token polling failed (HTTP ${status})`,
						"kimi",
						data.error,
					);
			}

			await sleep(intervalMs);
		}

		throw new OAuthError(
			"Timed out waiting for Kimi device authorization to be approved.",
			"kimi",
		);
	}
}
