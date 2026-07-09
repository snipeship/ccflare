import { ServiceUnavailableError, TokenRefreshError } from "@ccflare/core";
import { Logger } from "@ccflare/logger";
import type { TokenRefreshResult } from "@ccflare/providers";
import type { Account } from "@ccflare/types";
import { TOKEN_SAFETY_WINDOW_MS } from "../constants";
import { ERROR_MESSAGES, type ResolvedProxyContext } from "./proxy-types";
import {
	clearRefreshFailure,
	isInRefreshBackoff,
	recordRefreshFailure,
} from "./refresh-backoff";

const log = new Logger("TokenManager");

/**
 * Safely refreshes an access token with deduplication
 * @param account - The account to refresh token for
 * @param ctx - The proxy context
 * @returns Promise resolving to the new access token
 * @throws {TokenRefreshError} If token refresh fails
 * @throws {ServiceUnavailableError} If refresh promise is not found
 */
export async function refreshAccessTokenSafe(
	account: Account,
	ctx: ResolvedProxyContext,
): Promise<string> {
	// Check for recent refresh failures and implement backoff
	if (isInRefreshBackoff(account.id)) {
		log.warn(`Account ${account.name} is in refresh backoff period`);
		throw new ServiceUnavailableError(
			`Token refresh for account ${account.name} is in backoff period after recent failure`,
		);
	}

	// Check if a refresh is already in progress for this account
	if (!ctx.refreshInFlight.has(account.id)) {
		if (!ctx.provider.refreshToken) {
			throw new TokenRefreshError(
				account.id,
				new Error(
					`Provider ${ctx.provider.name} does not support OAuth token refresh`,
				),
			);
		}

		// Create a new refresh promise and store it
		const refreshPromise = ctx.provider
			.refreshToken(account, ctx.runtime.clientId)
			.then((result: TokenRefreshResult) => {
				// 1. Persist to database asynchronously
				ctx.asyncWriter.enqueue(() =>
					ctx.dbOps.updateAccountTokens(
						account.id,
						result.accessToken,
						result.expiresAt,
						result.refreshToken,
					),
				);

				// 2. Update the live in-memory account object immediately
				// This prevents subsequent requests from seeing stale token data
				account.access_token = result.accessToken;
				account.expires_at = result.expiresAt;
				if (result.refreshToken) {
					account.refresh_token = result.refreshToken;
				}
				account.last_used = Date.now();

				// Clear any previous failure record on successful refresh
				clearRefreshFailure(account.id);

				log.info(`Successfully refreshed token for account: ${account.name}`);
				return result.accessToken;
			})
			.catch((error) => {
				// Record the failure timestamp for backoff
				recordRefreshFailure(account.id);
				log.error(`Token refresh failed for account ${account.name}`, error);
				throw new TokenRefreshError(account.id, error as Error);
			})
			.finally(() => {
				// Clean up the map when done (success or failure)
				ctx.refreshInFlight.delete(account.id);
			});
		ctx.refreshInFlight.set(account.id, refreshPromise);
	}

	// Return the existing or new refresh promise
	const promise = ctx.refreshInFlight.get(account.id);
	if (!promise) {
		throw new ServiceUnavailableError(
			`${ERROR_MESSAGES.REFRESH_NOT_FOUND} ${account.id}`,
		);
	}
	return promise;
}

/**
 * Gets a valid access token for an account, refreshing if necessary
 * @param account - The account to get token for
 * @param ctx - The proxy context
 * @returns Promise resolving to a valid access token
 */
export async function getValidAccessToken(
	account: Account,
	ctx: ResolvedProxyContext,
): Promise<string> {
	// API key accounts don't use access tokens
	if (!account.refresh_token && account.api_key) {
		// Return empty string - the API key will be used in prepareHeaders
		return "";
	}

	// Check if token exists and won't expire within the safety window
	if (
		account.access_token &&
		account.expires_at &&
		account.expires_at - Date.now() > TOKEN_SAFETY_WINDOW_MS
	) {
		return account.access_token;
	}

	// Token is expired, missing, or will expire soon
	const reason = !account.access_token
		? "missing"
		: !account.expires_at
			? "no expiry"
			: account.expires_at <= Date.now()
				? "expired"
				: "expiring soon";

	log.info(`Token ${reason} for account: ${account.name}`);
	return await refreshAccessTokenSafe(account, ctx);
}
