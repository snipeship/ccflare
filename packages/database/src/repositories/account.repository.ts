import { type Account, type AccountRow, toAccount } from "@ccflare/types";
import { BaseRepository } from "./base.repository";

export class AccountRepository extends BaseRepository<Account> {
	findAll(): Account[] {
		const rows = this.query<AccountRow>(`
			SELECT 
				id, name, provider, api_key, refresh_token, access_token,
				expires_at, created_at, last_used, request_count, total_requests,
				rate_limited_until, session_start, session_request_count,
				COALESCE(account_tier, 1) as account_tier,
				COALESCE(paused, 0) as paused,
				rate_limit_reset, rate_limit_status, rate_limit_remaining,
				COALESCE(priority, 0) as priority
			FROM accounts
			ORDER BY priority ASC, created_at ASC
		`);
		return rows.map(toAccount);
	}

	findById(accountId: string): Account | null {
		const row = this.get<AccountRow>(
			`
			SELECT 
				id, name, provider, api_key, refresh_token, access_token,
				expires_at, created_at, last_used, request_count, total_requests,
				rate_limited_until, session_start, session_request_count,
				COALESCE(account_tier, 1) as account_tier,
				COALESCE(paused, 0) as paused,
				rate_limit_reset, rate_limit_status, rate_limit_remaining,
				COALESCE(priority, 0) as priority
			FROM accounts
			WHERE id = ?
		`,
			[accountId],
		);

		return row ? toAccount(row) : null;
	}

	updateTokens(
		accountId: string,
		accessToken: string,
		expiresAt: number,
		refreshToken?: string,
	): void {
		if (refreshToken) {
			this.run(
				`UPDATE accounts SET access_token = ?, expires_at = ?, refresh_token = ? WHERE id = ?`,
				[accessToken, expiresAt, refreshToken, accountId],
			);
		} else {
			this.run(
				`UPDATE accounts SET access_token = ?, expires_at = ? WHERE id = ?`,
				[accessToken, expiresAt, accountId],
			);
		}
	}

	incrementUsage(accountId: string, sessionDurationMs: number): void {
		const now = Date.now();
		this.run(
			`
			UPDATE accounts 
			SET 
				last_used = ?,
				request_count = request_count + 1,
				total_requests = total_requests + 1,
				session_start = CASE
					WHEN session_start IS NULL OR ? - session_start >= ? THEN ?
					ELSE session_start
				END,
				session_request_count = CASE
					WHEN session_start IS NULL OR ? - session_start >= ? THEN 1
					ELSE session_request_count + 1
				END
			WHERE id = ?
		`,
			[now, now, sessionDurationMs, now, now, sessionDurationMs, accountId],
		);
	}

	setRateLimited(accountId: string, until: number): void {
		this.run(`UPDATE accounts SET rate_limited_until = ? WHERE id = ?`, [
			until,
			accountId,
		]);
	}

	updateRateLimitMeta(
		accountId: string,
		status: string,
		reset: number | null,
		remaining?: number | null,
	): void {
		this.run(
			`UPDATE accounts SET rate_limit_status = ?, rate_limit_reset = ?, rate_limit_remaining = ? WHERE id = ?`,
			[status, reset, remaining ?? null, accountId],
		);
	}

	updateTier(accountId: string, tier: number): void {
		this.run(`UPDATE accounts SET account_tier = ? WHERE id = ?`, [
			tier,
			accountId,
		]);
	}

	pause(accountId: string): void {
		this.run(`UPDATE accounts SET paused = 1 WHERE id = ?`, [accountId]);
	}

	resume(accountId: string): void {
		this.run(`UPDATE accounts SET paused = 0 WHERE id = ?`, [accountId]);
	}

	resetSession(accountId: string, timestamp: number): void {
		this.run(
			`UPDATE accounts SET session_start = ?, session_request_count = 0 WHERE id = ?`,
			[timestamp, accountId],
		);
	}

	updateRequestCount(accountId: string, count: number): void {
		this.run(`UPDATE accounts SET session_request_count = ? WHERE id = ?`, [
			count,
			accountId,
		]);
	}

	rename(accountId: string, newName: string): void {
		this.run(`UPDATE accounts SET name = ? WHERE id = ?`, [newName, accountId]);
	}

	updatePriority(accountId: string, priority: number): void {
		this.run(`UPDATE accounts SET priority = ? WHERE id = ?`, [
			priority,
			accountId,
		]);
	}

	updateAccountsPriorities(
		accountPriorities: Array<{ id: string; priority: number }>,
	): void {
		const transaction = this.db.transaction(() => {
			for (const { id, priority } of accountPriorities) {
				this.run(`UPDATE accounts SET priority = ? WHERE id = ?`, [
					priority,
					id,
				]);
			}
		});
		transaction();
	}
}
