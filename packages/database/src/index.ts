// Re-export the DatabaseOperations class
import { DatabaseOperations } from "./database-operations";
export { DatabaseOperations };

// Re-export other utilities
export { AsyncDbWriter } from "./async-writer";
export type { RuntimeConfig } from "@ccflare/config";
export type { DatabaseConfig, DatabaseRetryConfig } from "./database-operations";
export { DatabaseFactory } from "./factory";
export { ensureSchema, runMigrations } from "./migrations";
export { resolveDbPath } from "./paths";
export { analyzeIndexUsage } from "./performance-indexes";

// Re-export repository types
export type { StatsRepository } from "./repositories/stats.repository";

// Re-export retry utilities for external use (from your improvements)
export { withDatabaseRetry, withDatabaseRetrySync } from "./retry";
