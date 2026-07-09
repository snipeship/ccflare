// Token management constants
export const TOKEN_SAFETY_WINDOW_MS = 30_000; // 30 seconds - proactive refresh window
export const TOKEN_REFRESH_BACKOFF_MS = 60_000; // 60 seconds - backoff after refresh failure

// Fallback cooldown applied when an account is rate-limited but the upstream
// response carries no parseable reset time. Ensures the account is still marked
// unavailable so requests fail over instead of sticking to it.
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000; // 60 seconds
