import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Disposable } from "@ccflare/core";
import type { RuntimeConfig } from "@ccflare/config";
import type { Account, StrategyStore } from "@ccflare/types";
import { ensureSchema, runMigrations } from "./migrations";
import { resolveDbPath } from "./paths";
import { AccountRepository } from "./repositories/account.repository";
import { AgentPreferenceRepository } from "./repositories/agent-preference.repository";
import { OAuthRepository } from "./repositories/oauth.repository";
import {
	type RequestData,
	RequestRepository,
} from "./repositories/request.repository";
import { StatsRepository } from "./repositories/stats.repository";
import { StrategyRepository } from "./repositories/strategy.repository";
import { withDatabaseRetrySync } from "./retry";

export interface DatabaseConfig {
	/** Enable WAL (Write-Ahead Logging) mode for better concurrency */
	walMode?: boolean;
	/** SQLite busy timeout in milliseconds */
	busyTimeoutMs?: number;
	/** Cache size in pages (negative value = KB) */
	cacheSize?: number;
	/** Synchronous mode: OFF, NORMAL, FULL */
	synchronous?: 'OFF' | 'NORMAL' | 'FULL';
	/** Memory-mapped I/O size in bytes */
	mmapSize?: number;
	/** Retry configuration for database operations */
	retry?: DatabaseRetryConfig;
}

export interface DatabaseRetryConfig {
	/** Maximum number of retry attempts for database operations */
	attempts?: number;
	/** Initial delay between retries in milliseconds */
	delayMs?: number;
	/** Backoff multiplier for exponential backoff */
	backoff?: number;
	/** Maximum delay between retries in milliseconds */
	maxDelayMs?: number;
}

/**
 * Apply SQLite pragmas for optimal performance on distributed filesystems
 * Integrates your performance improvements with the new architecture
 */
function configureSqlite(db: Database, config: DatabaseConfig): void {
	try {
		// Check database integrity first
		const integrityResult = db.query("PRAGMA integrity_check").get() as { integrity_check: string };
		if (integrityResult.integrity_check !== "ok") {
			throw new Error(`Database integrity check failed: ${integrityResult.integrity_check}`);
		}

		// Enable WAL mode for better concurrency (with error handling)
		if (config.walMode !== false) {
			try {
				const result = db.query("PRAGMA journal_mode = WAL").get() as { journal_mode: string };
				if (result.journal_mode !== "wal") {
					console.warn("Failed to enable WAL mode, falling back to DELETE mode");
					db.run("PRAGMA journal_mode = DELETE");
				}
			} catch (error) {
				console.warn("WAL mode failed, using DELETE mode:", error);
				db.run("PRAGMA journal_mode = DELETE");
			}
		}

		// Set busy timeout for lock handling
		if (config.busyTimeoutMs !== undefined) {
			db.run(`PRAGMA busy_timeout = ${config.busyTimeoutMs}`);
		}

		// Configure cache size
		if (config.cacheSize !== undefined) {
			db.run(`PRAGMA cache_size = ${config.cacheSize}`);
		}

		// Set synchronous mode (more conservative for distributed filesystems)
		const syncMode = config.synchronous || 'FULL'; // Default to FULL for safety
		db.run(`PRAGMA synchronous = ${syncMode}`);

		// Configure memory-mapped I/O (disable on distributed filesystems if problematic)
		if (config.mmapSize !== undefined && config.mmapSize > 0) {
			try {
				db.run(`PRAGMA mmap_size = ${config.mmapSize}`);
			} catch (error) {
				console.warn("Memory-mapped I/O failed, disabling:", error);
				db.run("PRAGMA mmap_size = 0");
			}
		}

		// Additional optimizations for distributed filesystems
		db.run("PRAGMA temp_store = MEMORY");
		db.run("PRAGMA foreign_keys = ON");

		// Add checkpoint interval for WAL mode
		db.run("PRAGMA wal_autocheckpoint = 1000");

	} catch (error) {
		console.error("Database configuration failed:", error);
		throw new Error(`Failed to configure SQLite database: ${error}`);
	}
}

/**
 * DatabaseOperations using Repository Pattern
 * Provides a clean, organized interface for database operations
 */
export class DatabaseOperations implements StrategyStore, Disposable {
	private db: Database;
	private runtime?: RuntimeConfig;
	private dbConfig: DatabaseConfig;
	private retryConfig: DatabaseRetryConfig;

	// Repositories
	private accounts: AccountRepository;
	private requests: RequestRepository;
	private oauth: OAuthRepository;
	private strategy: StrategyRepository;
	private stats: StatsRepository;
	private agentPreferences: AgentPreferenceRepository;

	constructor(dbPath?: string, dbConfig?: DatabaseConfig, retryConfig?: DatabaseRetryConfig) {
		const resolvedPath = dbPath ?? resolveDbPath();

		// Default database configuration optimized for distributed filesystems
		// More conservative settings to prevent corruption on Rook Ceph
		this.dbConfig = {
			walMode: true,
			busyTimeoutMs: 10000, // Increased timeout for distributed storage
			cacheSize: -10000, // Reduced cache size (10MB) for stability
			synchronous: 'FULL', // Full synchronous mode for data safety
			mmapSize: 0, // Disable memory-mapped I/O on distributed filesystems
			...dbConfig
		};

		// Default retry configuration for database operations
		this.retryConfig = {
			attempts: 3,
			delayMs: 100,
			backoff: 2,
			maxDelayMs: 5000,
			...retryConfig
		};

		// Ensure the directory exists
		const dir = dirname(resolvedPath);
		mkdirSync(dir, { recursive: true });

		this.db = new Database(resolvedPath, { create: true });

		// Apply SQLite configuration for distributed filesystem optimization
		configureSqlite(this.db, this.dbConfig);

		ensureSchema(this.db);
		runMigrations(this.db);

		// Initialize repositories
		this.accounts = new AccountRepository(this.db);
		this.requests = new RequestRepository(this.db);
		this.oauth = new OAuthRepository(this.db);
		this.strategy = new StrategyRepository(this.db);
		this.stats = new StatsRepository(this.db);
		this.agentPreferences = new AgentPreferenceRepository(this.db);
	}

	setRuntimeConfig(runtime: RuntimeConfig): void {
		this.runtime = runtime;

		// Update retry config from runtime config if available
		if (runtime.database?.retry) {
			this.retryConfig = {
				...this.retryConfig,
				...runtime.database.retry
			};
		}
	}

	getDatabase(): Database {
		return this.db;
	}

	/**
	 * Get the current retry configuration
	 */
	getRetryConfig(): DatabaseRetryConfig {
		return this.retryConfig;
	}

	// Account operations delegated to repository with retry logic
	getAllAccounts(): Account[] {
		return withDatabaseRetrySync(() => {
			return this.accounts.findAll();
		}, this.retryConfig, "getAllAccounts");
	}

	getAccount(accountId: string): Account | null {
		return withDatabaseRetrySync(() => {
			return this.accounts.findById(accountId);
		}, this.retryConfig, "getAccount");
	}

	updateAccountTokens(
		accountId: string,
		accessToken: string,
		expiresAt: number,
		refreshToken?: string,
	): void {
		withDatabaseRetrySync(() => {
			this.accounts.updateTokens(accountId, accessToken, expiresAt, refreshToken);
		}, this.retryConfig, "updateAccountTokens");
	}

	updateAccountUsage(accountId: string): void {
		const sessionDuration =
			this.runtime?.sessionDurationMs || 5 * 60 * 60 * 1000;
		withDatabaseRetrySync(() => {
			this.accounts.incrementUsage(accountId, sessionDuration);
		}, this.retryConfig, "updateAccountUsage");
	}

	markAccountRateLimited(accountId: string, until: number): void {
		withDatabaseRetrySync(() => {
			this.accounts.setRateLimited(accountId, until);
		}, this.retryConfig, "markAccountRateLimited");
	}

	updateAccountRateLimitMeta(
		accountId: string,
		status: string,
		reset: number | null,
		remaining?: number | null,
	): void {
		this.accounts.updateRateLimitMeta(accountId, status, reset, remaining);
	}

	updateAccountTier(accountId: string, tier: number): void {
		this.accounts.updateTier(accountId, tier);
	}

	pauseAccount(accountId: string): void {
		this.accounts.pause(accountId);
	}

	resumeAccount(accountId: string): void {
		this.accounts.resume(accountId);
	}

	renameAccount(accountId: string, newName: string): void {
		this.accounts.rename(accountId, newName);
	}

	resetAccountSession(accountId: string, timestamp: number): void {
		this.accounts.resetSession(accountId, timestamp);
	}

	updateAccountRequestCount(accountId: string, count: number): void {
		this.accounts.updateRequestCount(accountId, count);
	}

	// Request operations delegated to repository
	saveRequestMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
	): void {
		this.requests.saveMeta(
			id,
			method,
			path,
			accountUsed,
			statusCode,
			timestamp,
		);
	}

	saveRequest(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		success: boolean,
		errorMessage: string | null,
		responseTime: number,
		failoverAttempts: number,
		usage?: RequestData["usage"],
		agentUsed?: string,
	): void {
		this.requests.save({
			id,
			method,
			path,
			accountUsed,
			statusCode,
			success,
			errorMessage,
			responseTime,
			failoverAttempts,
			usage,
			agentUsed,
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

	listRequestPayloads(limit = 50): Array<{ id: string; json: string }> {
		return this.requests.listPayloads(limit);
	}

	listRequestPayloadsWithAccountNames(
		limit = 50,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.requests.listPayloadsWithAccountNames(limit);
	}

	// OAuth operations delegated to repository
	createOAuthSession(
		sessionId: string,
		accountName: string,
		verifier: string,
		mode: "console" | "max",
		tier: number,
		ttlMinutes = 10,
	): void {
		this.oauth.createSession(
			sessionId,
			accountName,
			verifier,
			mode,
			tier,
			ttlMinutes,
		);
	}

	getOAuthSession(sessionId: string): {
		accountName: string;
		verifier: string;
		mode: "console" | "max";
		tier: number;
	} | null {
		return this.oauth.getSession(sessionId);
	}

	deleteOAuthSession(sessionId: string): void {
		this.oauth.deleteSession(sessionId);
	}

	cleanupExpiredOAuthSessions(): number {
		return this.oauth.cleanupExpiredSessions();
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
	getRecentRequests(limit = 100): Array<{
		id: string;
		timestamp: number;
		method: string;
		path: string;
		account_used: string | null;
		status_code: number | null;
		success: boolean;
		response_time_ms: number | null;
	}> {
		return this.requests.getRecentRequests(limit);
	}

	getRequestStats(since?: number): {
		totalRequests: number;
		successfulRequests: number;
		failedRequests: number;
		avgResponseTime: number | null;
	} {
		return this.requests.getRequestStats(since);
	}

	aggregateStats(rangeMs?: number) {
		return this.requests.aggregateStats(rangeMs);
	}

	getRecentErrors(limit?: number): string[] {
		return this.requests.getRecentErrors(limit);
	}

	getTopModels(limit?: number): Array<{ model: string; count: number }> {
		return this.requests.getTopModels(limit);
	}

	getRequestsByAccount(since?: number): Array<{
		accountId: string;
		accountName: string | null;
		requestCount: number;
		successRate: number;
	}> {
		return this.requests.getRequestsByAccount(since);
	}

	// Agent preference operations delegated to repository
	getAgentPreference(agentId: string): { model: string } | null {
		return this.agentPreferences.getPreference(agentId);
	}

	getAllAgentPreferences(): Array<{ agent_id: string; model: string }> {
		return this.agentPreferences.getAllPreferences();
	}

	setAgentPreference(agentId: string, model: string): void {
		this.agentPreferences.setPreference(agentId, model);
	}

	deleteAgentPreference(agentId: string): boolean {
		return this.agentPreferences.deletePreference(agentId);
	}

	setBulkAgentPreferences(agentIds: string[], model: string): void {
		this.agentPreferences.setBulkPreferences(agentIds, model);
	}

	close(): void {
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

	/**
	 * Get the stats repository for consolidated stats access
	 */
	getStatsRepository(): StatsRepository {
		return this.stats;
	}
}
