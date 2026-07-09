import { TOKEN_REFRESH_BACKOFF_MS } from "../constants";

/**
 * Tracks the timestamp of the most recent token-refresh failure per account.
 *
 * This lives in-memory (not the database) because it reflects the live health of
 * an account's OAuth refresh, which the load balancer must consult when selecting
 * accounts. Keeping it in one small module lets both the token manager (which
 * records/clears failures) and the selection strategy (which skips backed-off
 * accounts) share the same state without a circular dependency.
 */
const refreshFailures = new Map<string, number>();

/** Record that a token refresh for the account just failed. */
export function recordRefreshFailure(
	accountId: string,
	now = Date.now(),
): void {
	refreshFailures.set(accountId, now);
}

/** Clear any recorded refresh failure after a successful refresh. */
export function clearRefreshFailure(accountId: string): void {
	refreshFailures.delete(accountId);
}

/**
 * Whether the account is currently in the refresh-failure backoff window.
 * Accounts in backoff should be skipped by account selection so requests fail
 * over to a healthy account; the window clears automatically once it elapses.
 */
export function isInRefreshBackoff(
	accountId: string,
	now = Date.now(),
): boolean {
	const lastFailure = refreshFailures.get(accountId);
	return (
		lastFailure !== undefined && now - lastFailure < TOKEN_REFRESH_BACKOFF_MS
	);
}
