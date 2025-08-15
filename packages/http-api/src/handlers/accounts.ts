import type { Database } from "bun:sqlite";
import * as cliCommands from "@ccflare/cli-commands";
import type { Config } from "@ccflare/config";
import {
	patterns,
	sanitizers,
	validateNumber,
	validateString,
} from "@ccflare/core";
import type { DatabaseOperations } from "@ccflare/database";
import {
	BadRequest,
	errorResponse,
	InternalServerError,
	jsonResponse,
	NotFound,
} from "@ccflare/http-common";
import { Logger } from "@ccflare/logger";
import type { AccountResponse } from "../types";

const log = new Logger("AccountsHandler");

/**
 * Create an accounts list handler
 */
export function createAccountsListHandler(db: Database) {
	return (): Response => {
		const now = Date.now();
		const sessionDuration = 5 * 60 * 60 * 1000; // 5 hours

		const accounts = db
			.query(
				`
				SELECT 
					id,
					name,
					provider,
					request_count,
					total_requests,
					last_used,
					created_at,
					expires_at,
					rate_limited_until,
					rate_limit_reset,
					rate_limit_status,
					rate_limit_remaining,
					session_start,
					session_request_count,
					COALESCE(account_tier, 1) as account_tier,
					COALESCE(paused, 0) as paused,
					COALESCE(priority, 0) as priority,
					CASE 
						WHEN expires_at > ?1 THEN 1 
						ELSE 0 
					END as token_valid,
					CASE 
						WHEN rate_limited_until > ?2 THEN 1
						ELSE 0
					END as rate_limited,
					CASE
						WHEN session_start IS NOT NULL AND ?3 - session_start < ?4 THEN
							'Active: ' || session_request_count || ' reqs'
						ELSE '-'
					END as session_info
				FROM accounts
				ORDER BY priority ASC, request_count DESC
			`,
			)
			.all(now, now, now, sessionDuration) as Array<{
			id: string;
			name: string;
			provider: string | null;
			request_count: number;
			total_requests: number;
			last_used: number | null;
			created_at: number;
			expires_at: number | null;
			rate_limited_until: number | null;
			rate_limit_reset: number | null;
			rate_limit_status: string | null;
			rate_limit_remaining: number | null;
			session_start: number | null;
			session_request_count: number;
			account_tier: number;
			paused: 0 | 1;
			priority: number;
			token_valid: 0 | 1;
			rate_limited: 0 | 1;
			session_info: string | null;
		}>;

		const response: AccountResponse[] = accounts.map((account) => {
			let rateLimitStatus = "OK";

			// Use unified rate limit status if available
			if (account.rate_limit_status) {
				rateLimitStatus = account.rate_limit_status;
				if (account.rate_limit_reset && account.rate_limit_reset > now) {
					const minutesLeft = Math.ceil(
						(account.rate_limit_reset - now) / 60000,
					);
					rateLimitStatus = `${account.rate_limit_status} (${minutesLeft}m)`;
				}
			} else if (
				account.rate_limited &&
				account.rate_limited_until &&
				account.rate_limited_until > now
			) {
				// Fall back to legacy rate limit check
				const minutesLeft = Math.ceil(
					(account.rate_limited_until - now) / 60000,
				);
				rateLimitStatus = `Rate limited (${minutesLeft}m)`;
			}

			return {
				id: account.id,
				name: account.name,
				provider: account.provider || "anthropic",
				requestCount: account.request_count,
				totalRequests: account.total_requests,
				lastUsed: account.last_used
					? new Date(account.last_used).toISOString()
					: null,
				created: new Date(account.created_at).toISOString(),
				tier: account.account_tier,
				paused: account.paused === 1,
				tokenStatus: account.token_valid ? "valid" : "expired",
				tokenExpiresAt: account.expires_at
					? new Date(account.expires_at).toISOString()
					: null,
				rateLimitStatus,
				rateLimitReset: account.rate_limit_reset
					? new Date(account.rate_limit_reset).toISOString()
					: null,
				rateLimitRemaining: account.rate_limit_remaining,
				sessionInfo: account.session_info || "",
				priority: account.priority,
			};
		});

		return jsonResponse(response);
	};
}

/**
 * Create an account tier update handler
 */
export function createAccountTierUpdateHandler(dbOps: DatabaseOperations) {
	return async (req: Request, accountId: string): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate tier input
			const tier = validateNumber(body.tier, "tier", {
				required: true,
				allowedValues: [1, 5, 20] as const,
			});

			if (tier === undefined) {
				return errorResponse(BadRequest("Tier is required"));
			}

			dbOps.updateAccountTier(accountId, tier);

			return jsonResponse({ success: true, tier });
		} catch (_error) {
			return errorResponse(
				InternalServerError("Failed to update account tier"),
			);
		}
	};
}

/**
 * Create an account add handler (manual token addition)
 * This is primarily used for adding accounts with existing tokens
 * For OAuth flow, use the OAuth handlers
 */
export function createAccountAddHandler(
	dbOps: DatabaseOperations,
	_config: Config,
) {
	return async (req: Request): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate account name
			const name = validateString(body.name, "name", {
				required: true,
				minLength: 1,
				maxLength: 100,
				pattern: patterns.accountName,
				transform: sanitizers.trim,
			});

			if (!name) {
				return errorResponse(BadRequest("Account name is required"));
			}

			// Validate tokens
			const accessToken = validateString(body.accessToken, "accessToken", {
				required: true,
				minLength: 1,
			});

			const refreshToken = validateString(body.refreshToken, "refreshToken", {
				required: true,
				minLength: 1,
			});

			if (!accessToken || !refreshToken) {
				return errorResponse(
					BadRequest("Access token and refresh token are required"),
				);
			}

			// Validate provider
			const provider =
				validateString(body.provider, "provider", {
					allowedValues: ["anthropic"] as const,
				}) || "anthropic";

			// Validate tier
			const tier = (validateNumber(body.tier, "tier", {
				allowedValues: [1, 5, 20] as const,
			}) || 1) as 1 | 5 | 20;

			try {
				// Add account directly to database
				const accountId = crypto.randomUUID();
				const now = Date.now();

				dbOps.getDatabase().run(
					`INSERT INTO accounts (
						id, name, provider, refresh_token, access_token,
						created_at, request_count, total_requests, account_tier
					) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
					[accountId, name, provider, refreshToken, accessToken, now, tier],
				);

				return jsonResponse({
					success: true,
					message: `Account ${name} added successfully`,
					tier,
					accountId,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("already exists")
				) {
					return errorResponse(BadRequest(error.message));
				}
				return errorResponse(InternalServerError((error as Error).message));
			}
		} catch (error) {
			log.error("Account add error:", error);
			return errorResponse(
				error instanceof Error ? error : new Error("Failed to add account"),
			);
		}
	};
}

/**
 * Create an account remove handler
 */
export function createAccountRemoveHandler(dbOps: DatabaseOperations) {
	return async (req: Request, accountName: string): Promise<Response> => {
		try {
			// Parse and validate confirmation
			const body = await req.json();

			// Validate confirmation string
			const confirm = validateString(body.confirm, "confirm", {
				required: true,
			});

			if (confirm !== accountName) {
				return errorResponse(
					BadRequest("Confirmation string does not match account name", {
						confirmationRequired: true,
					}),
				);
			}

			const result = cliCommands.removeAccount(dbOps, accountName);

			if (!result.success) {
				return errorResponse(NotFound(result.message));
			}

			return jsonResponse({
				success: true,
				message: result.message,
			});
		} catch (error) {
			return errorResponse(
				error instanceof Error ? error : new Error("Failed to remove account"),
			);
		}
	};
}

/**
 * Create an account pause handler
 */
export function createAccountPauseHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, accountId: string): Promise<Response> => {
		try {
			// Get account name by ID
			const db = dbOps.getDatabase();
			const account = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM accounts WHERE id = ?",
				)
				.get(accountId);

			if (!account) {
				return errorResponse(NotFound("Account not found"));
			}

			const result = cliCommands.pauseAccount(dbOps, account.name);

			if (!result.success) {
				return errorResponse(BadRequest(result.message));
			}

			return jsonResponse({
				success: true,
				message: result.message,
			});
		} catch (error) {
			return errorResponse(
				error instanceof Error ? error : new Error("Failed to pause account"),
			);
		}
	};
}

/**
 * Create an account resume handler
 */
export function createAccountResumeHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, accountId: string): Promise<Response> => {
		try {
			// Get account name by ID
			const db = dbOps.getDatabase();
			const account = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM accounts WHERE id = ?",
				)
				.get(accountId);

			if (!account) {
				return errorResponse(NotFound("Account not found"));
			}

			const result = cliCommands.resumeAccount(dbOps, account.name);

			if (!result.success) {
				return errorResponse(BadRequest(result.message));
			}

			return jsonResponse({
				success: true,
				message: result.message,
			});
		} catch (error) {
			return errorResponse(
				error instanceof Error ? error : new Error("Failed to resume account"),
			);
		}
	};
}

/**
 * Create an account rename handler
 */
export function createAccountRenameHandler(dbOps: DatabaseOperations) {
	return async (req: Request, accountId: string): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate new name
			const newName = validateString(body.name, "name", {
				required: true,
				minLength: 1,
				maxLength: 100,
				pattern: patterns.accountName,
				transform: sanitizers.trim,
			});

			if (!newName) {
				return errorResponse(BadRequest("New account name is required"));
			}

			// Check if account exists
			const db = dbOps.getDatabase();
			const account = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM accounts WHERE id = ?",
				)
				.get(accountId);

			if (!account) {
				return errorResponse(NotFound("Account not found"));
			}

			// Check if new name is already taken
			const existingAccount = db
				.query<{ id: string }, [string, string]>(
					"SELECT id FROM accounts WHERE name = ? AND id != ?",
				)
				.get(newName, accountId);

			if (existingAccount) {
				return errorResponse(
					BadRequest(`Account name '${newName}' is already taken`),
				);
			}

			// Rename the account
			dbOps.renameAccount(accountId, newName);

			return jsonResponse({
				success: true,
				message: `Account renamed from '${account.name}' to '${newName}'`,
				newName,
			});
		} catch (error) {
			log.error("Account rename error:", error);
			return errorResponse(
				error instanceof Error ? error : new Error("Failed to rename account"),
			);
		}
	};
}

/**
 * Create an accounts priority update handler
 */
export function createAccountsPriorityUpdateHandler(dbOps: DatabaseOperations) {
	return async (req: Request): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate the request body
			if (!Array.isArray(body.accountPriorities)) {
				return errorResponse(BadRequest("accountPriorities must be an array"));
			}

			const accountPriorities = body.accountPriorities as Array<{
				id: string;
				priority: number;
			}>;

			// Validate each account priority entry
			for (const entry of accountPriorities) {
				const accountId = validateString(entry.id, "id", {
					required: true,
					minLength: 1,
				});

				const priority = validateNumber(entry.priority, "priority", {
					required: true,
					min: 0,
				});

				if (!accountId || priority === undefined) {
					return errorResponse(
						BadRequest("Each entry must have a valid id and priority"),
					);
				}
			}

			// Update priorities using database operations method
			dbOps.updateAccountsPriorities(accountPriorities);

			return jsonResponse({
				success: true,
				message: "Account priorities updated successfully",
			});
		} catch (error) {
			log.error("Account priorities update error:", error);
			return errorResponse(
				error instanceof Error
					? error
					: new Error("Failed to update account priorities"),
			);
		}
	};
}
