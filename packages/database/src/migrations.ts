import type { Database } from "bun:sqlite";
import { Logger } from "@ccflare/logger";
import { addPerformanceIndexes } from "./performance-indexes";

const log = new Logger("DatabaseMigrations");

export interface MigrationProgress {
	current: number;
	total: number;
	operation: string;
	percentage: number;
}

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

	// Create index for faster queries
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC)`,
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

export function runMigrations(
	db: Database,
	onProgress?: (progress: MigrationProgress) => void,
): void {
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

	// Add FTS5 table for full-text search
	addFTSMigration(db, onProgress);
}

function addFTSMigration(
	db: Database,
	onProgress?: (progress: MigrationProgress) => void,
): void {
	// Check if FTS table already exists
	const ftsExists = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='request_payloads_fts'",
		)
		.get();

	if (!ftsExists) {
		log.info("Creating FTS5 table for full-text search...");

		// Create the FTS5 virtual table
		db.run(`
			CREATE VIRTUAL TABLE request_payloads_fts USING fts5(
				id UNINDEXED,
				request_body,
				response_body,
				tokenize='porter unicode61'
			)
		`);

		// Count total records to migrate
		const totalResult = db
			.prepare("SELECT COUNT(*) as count FROM request_payloads")
			.get() as { count: number };
		const totalRecords = totalResult.count;

		if (totalRecords > 0) {
			log.info(`Migrating ${totalRecords} records to FTS index...`);

			// Report initial progress
			if (onProgress && totalRecords > 100) {
				onProgress({
					current: 0,
					total: totalRecords,
					operation: "Indexing request/response data for search",
					percentage: 0,
				});
			}

			// Helper function to decode base64
			const decodeBase64 = (str: string | null): string => {
				if (!str || str === "[streamed]") return "";
				try {
					return Buffer.from(str, "base64").toString("utf-8");
				} catch {
					return str || "";
				}
			};

			// Migrate existing data in batches
			const batchSize = 100; // Smaller batch size for processing
			let processed = 0;

			// Prepare statements
			const selectStmt = db.prepare(`
				SELECT id, json
				FROM request_payloads
				LIMIT ?1 OFFSET ?2
			`);

			const insertStmt = db.prepare(`
				INSERT INTO request_payloads_fts (id, request_body, response_body)
				VALUES (?, ?, ?)
			`);

			// Process in batches
			while (processed < totalRecords) {
				const currentBatch = Math.min(batchSize, totalRecords - processed);
				const rows = selectStmt.all(currentBatch, processed) as Array<{
					id: string;
					json: string;
				}>;

				// Process each row
				for (const row of rows) {
					try {
						const data = JSON.parse(row.json);
						const requestBody = decodeBase64(data.request?.body);
						const responseBody = decodeBase64(data.response?.body);
						insertStmt.run(row.id, requestBody, responseBody);
					} catch (error) {
						log.debug(`Failed to process row ${row.id}:`, error);
						// Insert empty strings on error
						insertStmt.run(row.id, "", "");
					}
				}

				processed += rows.length;

				// Report progress
				if (onProgress && totalRecords > 100) {
					const percentage = Math.round((processed / totalRecords) * 100);
					onProgress({
						current: processed,
						total: totalRecords,
						operation: "Indexing request/response data for search",
						percentage,
					});
				}
			}

			log.info("FTS migration completed successfully");
		}

		// Note: We can't create triggers that decode base64 since SQLite doesn't support custom functions in triggers
		// Instead, we'll handle the decoding when we insert payloads in the RequestRepository

		// Create delete trigger
		db.run(`
			CREATE TRIGGER request_payloads_fts_delete
			AFTER DELETE ON request_payloads
			BEGIN
				DELETE FROM request_payloads_fts WHERE id = old.id;
			END
		`);

		log.info("FTS5 table and triggers created successfully");
	}
}
