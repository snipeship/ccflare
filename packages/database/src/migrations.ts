import type { Database } from "bun:sqlite";
import { Logger } from "@ccflare/logger";
import { addPerformanceIndexes } from "./performance-indexes";

const log = new Logger("DatabaseMigrations");

export function ensureSchema(db: Database): void {
	// Create accounts table
	db.run(`
		CREATE TABLE IF NOT EXISTS accounts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT DEFAULT 'anthropic',
			api_key TEXT,
			refresh_token TEXT NOT NULL,
			access_token TEXT,
			expires_at INTEGER,
			created_at INTEGER NOT NULL,
			last_used INTEGER,
			request_count INTEGER DEFAULT 0,
			total_requests INTEGER DEFAULT 0,
			account_tier INTEGER DEFAULT 1
		)
	`);

	// Create requests table
	db.run(`
		CREATE TABLE IF NOT EXISTS requests (
			id TEXT PRIMARY KEY,
			timestamp INTEGER NOT NULL,
			method TEXT NOT NULL,
			path TEXT NOT NULL,
			account_used TEXT,
			status_code INTEGER,
			success BOOLEAN,
			error_message TEXT,
			response_time_ms INTEGER,
			failover_attempts INTEGER DEFAULT 0,
			model TEXT,
			prompt_tokens INTEGER DEFAULT 0,
			completion_tokens INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			cost_usd REAL DEFAULT 0,
			output_tokens_per_second REAL,
			input_tokens INTEGER DEFAULT 0,
			cache_read_input_tokens INTEGER DEFAULT 0,
			cache_creation_input_tokens INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			agent_used TEXT
		)
	`);

	// Create indexes for faster queries
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC)`,
	);

	// Index for JOIN performance with accounts table
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_requests_account_used ON requests(account_used)`,
	);

	// Composite index for the main requests query (timestamp DESC with account_used for JOIN)
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_requests_timestamp_account ON requests(timestamp DESC, account_used)`,
	);

	// Create request_payloads table for storing full request/response data
	db.run(`
		CREATE TABLE IF NOT EXISTS request_payloads (
			id TEXT PRIMARY KEY,
			json TEXT NOT NULL,
			FOREIGN KEY (id) REFERENCES requests(id) ON DELETE CASCADE
		)
	`);

	// Create oauth_sessions table for secure PKCE verifier storage
	db.run(`
		CREATE TABLE IF NOT EXISTS oauth_sessions (
			id TEXT PRIMARY KEY,
			account_name TEXT NOT NULL,
			verifier TEXT NOT NULL,
			mode TEXT NOT NULL,
			tier INTEGER DEFAULT 1,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		)
	`);

	// Create index for faster cleanup of expired sessions
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires ON oauth_sessions(expires_at)`,
	);

	// Create agent_preferences table for storing user-defined agent settings
	db.run(`
		CREATE TABLE IF NOT EXISTS agent_preferences (
			agent_id TEXT PRIMARY KEY,
			model TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`);
}

export function runMigrations(db: Database): void {
	// Ensure base schema exists first
	ensureSchema(db);
	// Check if columns exist before adding them
	const accountsInfo = db
		.prepare("PRAGMA table_info(accounts)")
		.all() as Array<{
		cid: number;
		name: string;
		type: string;
		notnull: number;
		// biome-ignore lint/suspicious/noExplicitAny: SQLite pragma can return various default value types
		dflt_value: any;
		pk: number;
	}>;

	const accountsColumnNames = accountsInfo.map((col) => col.name);

	// Add rate_limited_until column if it doesn't exist
	if (!accountsColumnNames.includes("rate_limited_until")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN rate_limited_until INTEGER",
		).run();
		log.info("Added rate_limited_until column to accounts table");
	}

	// Add session_start column if it doesn't exist
	if (!accountsColumnNames.includes("session_start")) {
		db.prepare("ALTER TABLE accounts ADD COLUMN session_start INTEGER").run();
		log.info("Added session_start column to accounts table");
	}

	// Add session_request_count column if it doesn't exist
	if (!accountsColumnNames.includes("session_request_count")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN session_request_count INTEGER DEFAULT 0",
		).run();
		log.info("Added session_request_count column to accounts table");
	}

	// Add account_tier column if it doesn't exist
	if (!accountsColumnNames.includes("account_tier")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN account_tier INTEGER DEFAULT 1",
		).run();
		log.info("Added account_tier column to accounts table");
	}

	// Add paused column if it doesn't exist
	if (!accountsColumnNames.includes("paused")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN paused INTEGER DEFAULT 0",
		).run();
		log.info("Added paused column to accounts table");
	}

	// Add rate_limit_reset column if it doesn't exist
	if (!accountsColumnNames.includes("rate_limit_reset")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN rate_limit_reset INTEGER",
		).run();
		log.info("Added rate_limit_reset column to accounts table");
	}

	// Add rate_limit_status column if it doesn't exist
	if (!accountsColumnNames.includes("rate_limit_status")) {
		db.prepare("ALTER TABLE accounts ADD COLUMN rate_limit_status TEXT").run();
		log.info("Added rate_limit_status column to accounts table");
	}

	// Add rate_limit_remaining column if it doesn't exist
	if (!accountsColumnNames.includes("rate_limit_remaining")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN rate_limit_remaining INTEGER",
		).run();
		log.info("Added rate_limit_remaining column to accounts table");
	}

	// Check columns in requests table
	const requestsInfo = db
		.prepare("PRAGMA table_info(requests)")
		.all() as Array<{
		cid: number;
		name: string;
		type: string;
		notnull: number;
		// biome-ignore lint/suspicious/noExplicitAny: SQLite pragma can return various default value types
		dflt_value: any;
		pk: number;
	}>;

	const requestsColumnNames = requestsInfo.map((col) => col.name);

	// Add model column if it doesn't exist
	if (!requestsColumnNames.includes("model")) {
		db.prepare("ALTER TABLE requests ADD COLUMN model TEXT").run();
		log.info("Added model column to requests table");
	}

	// Add prompt_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("prompt_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN prompt_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added prompt_tokens column to requests table");
	}

	// Add completion_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("completion_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN completion_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added completion_tokens column to requests table");
	}

	// Add total_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("total_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN total_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added total_tokens column to requests table");
	}

	// Add cost_usd column if it doesn't exist
	if (!requestsColumnNames.includes("cost_usd")) {
		db.prepare("ALTER TABLE requests ADD COLUMN cost_usd REAL DEFAULT 0").run();
		log.info("Added cost_usd column to requests table");
	}

	// Add input_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("input_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN input_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added input_tokens column to requests table");
	}

	// Add cache_read_input_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("cache_read_input_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added cache_read_input_tokens column to requests table");
	}

	// Add cache_creation_input_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("cache_creation_input_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added cache_creation_input_tokens column to requests table");
	}

	// Add output_tokens column if it doesn't exist
	if (!requestsColumnNames.includes("output_tokens")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN output_tokens INTEGER DEFAULT 0",
		).run();
		log.info("Added output_tokens column to requests table");
	}

	// Add agent_used column if it doesn't exist
	if (!requestsColumnNames.includes("agent_used")) {
		db.prepare("ALTER TABLE requests ADD COLUMN agent_used TEXT").run();
		log.info("Added agent_used column to requests table");
	}

	// Add output_tokens_per_second column if it doesn't exist
	if (!requestsColumnNames.includes("output_tokens_per_second")) {
		db.prepare(
			"ALTER TABLE requests ADD COLUMN output_tokens_per_second REAL",
		).run();
		log.info("Added output_tokens_per_second column to requests table");
	}

	// Add performance indexes
	addPerformanceIndexes(db);
}
