import { Logger } from "@ccflare/logger";
import { type Account, getProviderDefaultBaseUrl } from "@ccflare/types";
import { deleteTransportHeaders } from "../../base";
import {
	executeTokenRefresh,
	type RefreshRequestConfig,
} from "../../token-refresh";
import type { TokenRefreshResult } from "../../types";
import { AnthropicProvider } from "../anthropic/provider";
import { CLAUDE_CODE_OAUTH_TOKEN_URL, ClaudeCodeOAuthProvider } from "./oauth";

const log = new Logger("ClaudeCodeProvider");
const PROVIDER_NAME = "claude-code" as const;
const DEFAULT_BASE_URL = getProviderDefaultBaseUrl(PROVIDER_NAME);

const CLAUDE_CODE_REFRESH_CONFIG: RefreshRequestConfig = {
	tokenUrl: CLAUDE_CODE_OAUTH_TOKEN_URL,
	contentType: "application/json",
	buildBody(refreshToken: string, clientId: string) {
		return JSON.stringify({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
		});
	},
	parseTokens(json: Record<string, unknown>, account: Account) {
		const refreshToken =
			(json.refresh_token as string) || (account.refresh_token ?? "");
		if (!json.refresh_token) {
			log.warn(
				`Claude Code refresh endpoint did not return a refresh_token for ${account.name} - continuing with previous one`,
			);
		}
		return {
			accessToken: json.access_token as string,
			expiresAt: Date.now() + (json.expires_in as number) * 1000,
			refreshToken,
		};
	},
};

export class ClaudeCodeProvider extends AnthropicProvider {
	name: string = PROVIDER_NAME;
	defaultBaseUrl: string = DEFAULT_BASE_URL;

	async refreshToken(
		account: Account,
		clientId: string,
	): Promise<TokenRefreshResult> {
		return executeTokenRefresh(
			account,
			clientId,
			CLAUDE_CODE_REFRESH_CONFIG,
			log,
		);
	}

	prepareHeaders(headers: Headers, account: Account | null): Headers {
		const newHeaders = new Headers(headers);

		if (account?.access_token) {
			newHeaders.set("Authorization", `Bearer ${account.access_token}`);

			// OAuth Bearer tokens require this beta flag or Anthropic rejects
			// the request as unauthenticated for some models (observed: haiku
			// works without it, sonnet does not). Merge with any beta value
			// already on the request rather than clobbering it.
			const existingBeta = newHeaders.get("anthropic-beta");
			const betas = new Set(
				existingBeta ? existingBeta.split(",").map((b) => b.trim()) : [],
			);
			betas.add("oauth-2025-04-20");
			newHeaders.set("anthropic-beta", Array.from(betas).join(","));
		}

		// Remove api_key header -- Claude Code uses OAuth Bearer tokens
		newHeaders.delete("x-api-key");

		deleteTransportHeaders(newHeaders);

		return newHeaders;
	}

	supportsOAuth(): boolean {
		return true;
	}

	getOAuthProvider() {
		return new ClaudeCodeOAuthProvider();
	}
}
