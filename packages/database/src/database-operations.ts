import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Disposable } from "@ccflare/core";
import type {
	Account,
	AccountProvider,
	AnalyticsResponse,
	AuthMethod,
	HttpMethod,
	Request,
	RequestSummary,
	StrategyStore,
} from "@ccflare/types";
import { ensureSchema, runMigrations } from "./migrations";
import type { RequestWithAccountName } from "./models/request-row";
import { resolveDbPath } from "./paths";
import {
	AccountRepository,
	type CreateAccountData,
	type UpdateAccountData,
} from "./repositories/account.repository";
import {
	type AnalyticsQueryOptions,
	AnalyticsRepository,
} from "./repositories/analytics.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";
import {
	type RequestData,
	type RequestDetailRow,
	RequestRepository,
} from "./repositories/request.repository";
import { StatsRepository } from "./repositories/stats.repository";
import { StrategyRepository } from "./repositories/strategy.repository";

export interface RuntimeConfig {
	sessionDurationMs?: number;
}

/**
 * DatabaseOperations using Repository Pattern
 * Provides a clean, organized interface for database operations
 */
export class DatabaseOperations implements StrategyStore, Disposable {
	private db: Database;
	private runtime?: RuntimeConfig;
	private closed = false;

	// Repositories
	private accounts: AccountRepository;
	private analytics: AnalyticsRepository;
	private requests: RequestRepository;
	private authSessions: AuthSessionRepository;
	private strategy: StrategyRepository;
	private stats: StatsRepository;

	constructor(dbPath?: string) {
		const resolvedPath = dbPath ?? resolveDbPath();

		// Ensure the directory exists
		const dir = dirname(resolvedPath);
		mkdirSync(dir, { recursive: true });

		this.db = new Database(resolvedPath, { create: true });

		// Configure SQLite for better concurrency
		this.db.exec("PRAGMA foreign_keys = ON"); // Enforce declared foreign keys
		this.db.exec("PRAGMA journal_mode = WAL"); // Enable Write-Ahead Logging
		this.db.exec("PRAGMA busy_timeout = 5000"); // Wait up to 5 seconds before throwing "database is locked"
		this.db.exec("PRAGMA synchronous = NORMAL"); // Better performance while maintaining safety

		ensureSchema(this.db);
		runMigrations(this.db);

		// Initialize repositories
		this.accounts = new AccountRepository(this.db);
		this.analytics = new AnalyticsRepository(this.db);
		this.requests = new RequestRepository(this.db);
		this.authSessions = new AuthSessionRepository(this.db);
		this.strategy = new StrategyRepository(this.db);
		this.stats = new StatsRepository(this.db);
	}

	setRuntimeConfig(runtime: RuntimeConfig): void {
		this.runtime = runtime;
	}

	getDatabase(): Database {
		return this.db;
	}

	// Account operations delegated to repository
	getAllAccounts(): Account[] {
		return this.accounts.findAll();
	}

	getAccount(accountId: string): Account | null {
		return this.accounts.findById(accountId);
	}

	getAccountByName(name: string): Account | null {
		return this.accounts.findByName(name);
	}

	getAccountsByProvider(provider: Account["provider"]): Account[] {
		return this.accounts.findByProvider(provider);
	}

	getAvailableAccountsByProvider(provider: Account["provider"]): Account[] {
		return this.accounts.findAvailableForProvider(provider);
	}

	createAccount(data: CreateAccountData): Account {
		return this.accounts.create(data);
	}

	/**
	 * Create an API-key account with duplicate-name check.
	 * Throws if the name is already taken.
	 */
	createApiKeyAccount(
		opts: Parameters<AccountRepository["createApiKeyAccount"]>[0],
	): Account {
		return this.accounts.createApiKeyAccount(opts);
	}

	/**
	 * Create an OAuth account with duplicate-name check.
	 * Throws if the name is already taken.
	 */
	createOAuthAccount(
		opts: Parameters<AccountRepository["createOAuthAccount"]>[0],
	): Account {
		return this.accounts.createOAuthAccount(opts);
	}

	updateAccount(accountId: string, data: UpdateAccountData): Account | null {
		return this.accounts.update(accountId, data);
	}

	deleteAccount(accountId: string): boolean {
		return this.accounts.delete(accountId);
	}

	countAccounts(): number {
		return this.accounts.count();
	}

	updateAccountTokens(
		accountId: string,
		accessToken: string,
		expiresAt: number | null,
		refreshToken?: string,
	): void {
		this.accounts.updateTokens(accountId, accessToken, expiresAt, refreshToken);
	}

	updateAccountUsage(accountId: string): void {
		const sessionDuration =
			this.runtime?.sessionDurationMs || 5 * 60 * 60 * 1000;
		this.accounts.incrementUsage(accountId, sessionDuration);
	}

	markAccountRateLimited(accountId: string, until: number): void {
		this.accounts.setRateLimited(accountId, until);
	}

	updateAccountRateLimitMeta(
		accountId: string,
		status: string,
		reset: number | null,
		remaining?: number | null,
	): void {
		this.accounts.updateRateLimitMeta(accountId, status, reset, remaining);
	}

	pauseAccount(accountId: string): void {
		this.accounts.pause(accountId);
	}

	resumeAccount(accountId: string): void {
		this.accounts.resume(accountId);
	}

	resetAccountSession(accountId: string, timestamp: number): void {
		this.accounts.resetSession(accountId, timestamp);
	}

	updateAccountRequestCount(accountId: string, count: number): void {
		this.accounts.updateRequestCount(accountId, count);
	}

	resetAccountStats(options?: { resetSessionStart?: boolean }): void {
		this.accounts.resetStatistics(options?.resetSessionStart === true);
	}

	resetStats(): void {
		this.clearRequestHistory();
		this.resetAccountStats({ resetSessionStart: true });
	}

	// Request operations delegated to repository
	saveRequestMeta(
		id: string,
		method: HttpMethod,
		path: string,
		provider: AccountProvider,
		upstreamPath: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
	): void {
		this.requests.saveMeta(
			id,
			method,
			path,
			provider,
			upstreamPath,
			accountUsed,
			statusCode,
			timestamp,
		);
	}

	saveRequest(
		id: string,
		method: HttpMethod,
		path: string,
		provider: AccountProvider,
		upstreamPath: string,
		accountUsed: string | null,
		statusCode: number | null,
		success: boolean,
		errorMessage: string | null,
		responseTime: number,
		failoverAttempts: number,
		usage?: RequestData["usage"],
		options?: {
			timestamp?: number;
			payload?: unknown;
			timings?: RequestData["timings"];
		},
	): void {
		this.requests.save({
			id,
			method,
			path,
			provider,
			upstreamPath,
			accountUsed,
			statusCode,
			success,
			errorMessage,
			responseTime,
			failoverAttempts,
			usage,
			timestamp: options?.timestamp,
			payload: options?.payload,
			timings: options?.timings,
		});
	}

	updateRequestUsage(requestId: string, usage: RequestData["usage"]): void {
		this.requests.updateUsage(requestId, usage);
	}

	saveRequestPayload(id: string, data: unknown): void {
		this.requests.savePayload(id, data);
	}

	getRequestPayload(id: string): unknown | null {
		return this.requests.getPayload(id);
	}

	listRequestSummaries(limit = 50): RequestSummary[] {
		return this.requests.listSummaries(limit);
	}

	listRequestsWithAccountNames(limit = 50): RequestWithAccountName[] {
		return this.requests.listWithAccountNames(limit);
	}

	listRequestPayloads(limit = 50): Array<{ id: string; json: string }> {
		return this.requests.listPayloads(limit);
	}

	listRequestPayloadsWithAccountNames(
		limit = 50,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.requests.listPayloadsWithAccountNames(limit);
	}

	getRequestDetailRow(requestId: string): RequestDetailRow | null {
		return this.requests.findDetailRow(requestId);
	}

	listResponseChainPayloadsWithAccountNames(
		requestId: string,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.requests.listResponseChainPayloadsWithAccountNames(requestId);
	}

	// Auth session operations delegated to repository
	createAuthSession(
		provider: AccountProvider,
		authMethod: AuthMethod,
		accountName: string,
		stateJson: string,
		expiresAt: number,
	): string {
		return this.authSessions.createSession(
			provider,
			authMethod,
			accountName,
			stateJson,
			expiresAt,
		);
	}

	getAuthSession(sessionId: string): {
		id: string;
		provider: AccountProvider;
		authMethod: AuthMethod;
		accountName: string;
		stateJson: string;
		createdAt: string;
		expiresAt: string;
	} | null {
		return this.authSessions.getSession(sessionId);
	}

	getAuthSessionByState(state: string): {
		id: string;
		provider: AccountProvider;
		authMethod: AuthMethod;
		accountName: string;
		stateJson: string;
		createdAt: string;
		expiresAt: string;
	} | null {
		return this.authSessions.getSessionByState(state);
	}

	updateAuthSessionState(
		sessionId: string,
		stateJson: string,
		expiresAt?: number,
	): void {
		this.authSessions.updateSessionState(sessionId, stateJson, expiresAt);
	}

	deleteAuthSession(sessionId: string): void {
		this.authSessions.deleteSession(sessionId);
	}

	deleteExpiredAuthSessions(): number {
		return this.authSessions.deleteExpiredSessions();
	}

	// Strategy operations delegated to repository
	getStrategy(name: string): {
		name: string;
		config: Record<string, unknown>;
		updatedAt: number;
	} | null {
		return this.strategy.getStrategy(name);
	}

	setStrategy(name: string, config: Record<string, unknown>): void {
		this.strategy.set(name, config);
	}

	listStrategies(): Array<{
		name: string;
		config: Record<string, unknown>;
		updatedAt: number;
	}> {
		return this.strategy.list();
	}

	deleteStrategy(name: string): boolean {
		return this.strategy.delete(name);
	}

	// Analytics methods delegated to request repository
	getRecentRequests(limit = 100): Request[] {
		return this.requests.getRecentRequests(limit);
	}

	clearRequestHistory(): number {
		return this.requests.clear();
	}

	getAnalytics(options: AnalyticsQueryOptions): AnalyticsResponse {
		return this.analytics.getAnalytics(options);
	}

	// Cleanup operations (payload by age; request metadata by age; plus orphan sweep)
	cleanupOldRequests(
		payloadRetentionMs: number,
		requestRetentionMs?: number,
	): {
		removedRequests: number;
		removedPayloads: number;
	} {
		const now = Date.now();
		const payloadCutoff = now - payloadRetentionMs;
		let removedRequests = 0;
		if (
			typeof requestRetentionMs === "number" &&
			Number.isFinite(requestRetentionMs)
		) {
			const requestCutoff = now - requestRetentionMs;
			removedRequests = this.requests.deleteOlderThan(requestCutoff);
		}
		const removedPayloadsByAge =
			this.requests.deletePayloadsOlderThan(payloadCutoff);
		const removedOrphans = this.requests.deleteOrphanedPayloads();
		const removedPayloads = removedPayloadsByAge + removedOrphans;
		return { removedRequests, removedPayloads };
	}

	close(): void {
		if (this.closed) {
			return;
		}

		this.closed = true;
		// Ensure all write operations are flushed before closing
		this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		this.db.close();
	}

	dispose(): void {
		this.close();
	}

	// Optimize database periodically to maintain performance
	optimize(): void {
		this.db.exec("PRAGMA optimize");
		this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
	}

	/** Compact and reclaim disk space (blocks DB during operation) */
	compact(): void {
		// Ensure WAL is checkpointed and truncated, then VACUUM to rebuild file
		this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		this.db.exec("VACUUM");
	}

	/**
	 * Get the stats repository for consolidated stats access
	 */
	getStatsRepository(): StatsRepository {
		return this.stats;
	}
}
