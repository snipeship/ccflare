import { logError, RateLimitError } from "@ccflare/core";
import { Logger } from "@ccflare/logger";
import type { RateLimitInfo } from "@ccflare/providers";
import type { Account } from "@ccflare/types";
import { DEFAULT_RATE_LIMIT_COOLDOWN_MS } from "../constants";
import type { ResolvedProxyContext } from "./proxy-types";

const log = new Logger("ResponseProcessor");

/**
 * Handles rate limit response for an account
 * @param account - The rate-limited account
 * @param rateLimitInfo - Parsed rate limit information
 * @param ctx - The proxy context
 */
export function handleRateLimitResponse(
	account: Account,
	rateLimitInfo: RateLimitInfo,
	ctx: ResolvedProxyContext,
): void {
	// Use the upstream-provided reset time when available; otherwise fall back to
	// a default cooldown so the account is still marked unavailable and requests
	// fail over instead of sticking to a rate-limited account.
	const resetTime =
		rateLimitInfo.resetTime ?? Date.now() + DEFAULT_RATE_LIMIT_COOLDOWN_MS;

	log.warn(
		`Account ${account.name} rate-limited until ${new Date(
			resetTime,
		).toISOString()}`,
	);

	ctx.asyncWriter.enqueue(() =>
		ctx.dbOps.markAccountRateLimited(account.id, resetTime),
	);

	const rateLimitError = new RateLimitError(
		account.id,
		resetTime,
		rateLimitInfo.remaining,
	);
	logError(rateLimitError, log);
}

/**
 * Updates account rate-limit metadata in the background.
 * Usage counters are owned by the worker after it processes the full response.
 * Accepts pre-parsed rate limit info to avoid re-parsing headers.
 */
export function updateAccountMetadata(
	account: Account,
	rateLimitInfo: RateLimitInfo,
	ctx: ResolvedProxyContext,
): void {
	// Only update rate limit metadata when we have actual rate limit headers
	if (rateLimitInfo.statusHeader) {
		const status = rateLimitInfo.statusHeader;
		ctx.asyncWriter.enqueue(() =>
			ctx.dbOps.updateAccountRateLimitMeta(
				account.id,
				status,
				rateLimitInfo.resetTime ?? null,
				rateLimitInfo.remaining,
			),
		);
	}
}

/**
 * Processes a successful proxy response
 * @param response - The provider response
 * @param account - The account used
 * @param ctx - The proxy context
 * @returns Whether the response is rate-limited
 */
export function processProxyResponse(
	response: Response,
	account: Account,
	ctx: ResolvedProxyContext,
): boolean {
	const isStream = ctx.provider.isStreamingResponse?.(response) ?? false;
	// Parse rate-limit headers once and pass the result through
	const rateLimitInfo = ctx.provider.parseRateLimit(response);

	// Handle rate limit
	if (!isStream && rateLimitInfo.isRateLimited) {
		handleRateLimitResponse(account, rateLimitInfo, ctx);
		updateAccountMetadata(account, rateLimitInfo, ctx);
		return true; // Signal rate limit
	}

	// Update account metadata in background
	updateAccountMetadata(account, rateLimitInfo, ctx);
	return false;
}

/**
 * Handles errors that occur during proxy operations
 * @param error - The error that occurred
 * @param account - The account that failed (optional)
 * @param logger - Logger instance
 */
export function handleProxyError(
	error: unknown,
	account: Account | null,
	logger: Logger,
): void {
	logError(error, logger);
	if (account) {
		logger.error(`Failed to proxy request with account ${account.name}`);
	} else {
		logger.error("Failed to proxy request");
	}
}
