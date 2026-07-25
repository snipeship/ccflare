import { Logger } from "@ccflare/logger";
import { type Account, getProviderDefaultBaseUrl } from "@ccflare/types";
import { deleteTransportHeaders } from "../../base";
import {
	executeTokenRefresh,
	type RefreshRequestConfig,
} from "../../token-refresh";
import type { TokenRefreshResult } from "../../types";
import { OpenAIProvider } from "../openai/provider";
import {
	KIMI_OAUTH_CLIENT_ID,
	KIMI_OAUTH_TOKEN_URL,
	KimiOAuthProvider,
} from "./oauth";

const log = new Logger("KimiProvider");
const PROVIDER_NAME = "kimi" as const;
const DEFAULT_BASE_URL = getProviderDefaultBaseUrl(PROVIDER_NAME);

/**
 * Kimi access tokens are short-lived (900s), so the proxy refreshes far more
 * often than for other providers. The refresh token is rotated on every
 * successful refresh; fall back to the stored one only if the server omits it.
 */
const KIMI_REFRESH_CONFIG: RefreshRequestConfig = {
	tokenUrl: KIMI_OAUTH_TOKEN_URL,
	contentType: "application/x-www-form-urlencoded",
	buildBody(refreshToken: string, _clientId: string) {
		return new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: KIMI_OAUTH_CLIENT_ID,
		}).toString();
	},
	parseTokens(json: Record<string, unknown>, account: Account) {
		const expiresAt =
			(json.expires_at as number | undefined) ??
			Date.now() + ((json.expires_in as number | undefined) ?? 900) * 1000;
		return {
			accessToken: json.access_token as string,
			expiresAt,
			refreshToken:
				(json.refresh_token as string | undefined) ??
				account.refresh_token ??
				"",
		};
	},
};

/**
 * Kimi Code exposes an OpenAI-compatible chat-completions API at
 * `https://api.kimi.com/coding/v1`, so URL building, rate-limit parsing and
 * usage extraction are inherited from the OpenAI provider. Only auth differs.
 */
export class KimiProvider extends OpenAIProvider {
	name: string = PROVIDER_NAME;
	defaultBaseUrl: string = DEFAULT_BASE_URL;

	async refreshToken(
		account: Account,
		clientId: string,
	): Promise<TokenRefreshResult> {
		return executeTokenRefresh(account, clientId, KIMI_REFRESH_CONFIG, log);
	}

	prepareHeaders(headers: Headers, account: Account | null): Headers {
		const newHeaders = new Headers(headers);

		if (account?.access_token) {
			newHeaders.set("Authorization", `Bearer ${account.access_token}`);
		}

		// Remove Anthropic-family headers that don't belong on Kimi requests.
		newHeaders.delete("x-api-key");
		newHeaders.delete("anthropic-version");

		deleteTransportHeaders(newHeaders);

		return newHeaders;
	}

	supportsOAuth(): boolean {
		return true;
	}

	getOAuthProvider() {
		return new KimiOAuthProvider();
	}
}
