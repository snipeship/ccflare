#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { Logger } from "@ccflare/logger";
import type { DatabaseOperations } from "./database-operations";
import { resolveDbPath } from "./paths";
import { analyzeIndexUsage } from "./performance-indexes";

const log = new Logger("PerformanceAnalysis");

/**
 * Analyze query performance and index usage
 */
function analyzeQueryPerformance(db: Database) {
	log.info("\n=== Query Performance Analysis ===\n");

	// Test queries that should benefit from the new indexes
	const testQueries = [
		{
			name: "Time-based account analytics",
			query: `
				SELECT COUNT(*), account_used 
				FROM requests 
				WHERE timestamp > ? AND account_used IS NOT NULL 
				GROUP BY account_used
			`,
			params: [Date.now() - 24 * 60 * 60 * 1000], // Last 24 hours
		},
		{
			name: "Model performance with timestamp filter",
			query: `
				SELECT model, COUNT(*), AVG(response_time_ms)
				FROM requests 
				WHERE timestamp > ? AND model IS NOT NULL 
				GROUP BY model
			`,
			params: [Date.now() - 24 * 60 * 60 * 1000],
		},
		{
			name: "Success rate calculation",
			query: `
				SELECT 
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
				FROM requests 
				WHERE timestamp > ?
			`,
			params: [Date.now() - 24 * 60 * 60 * 1000],
		},
		{
			name: "Active accounts lookup",
			query: `
				SELECT id, name, request_count 
				FROM accounts 
				WHERE paused = 0 
				ORDER BY request_count DESC
			`,
			params: [],
		},
		{
			name: "Cost analysis by model",
			query: `
				SELECT model, SUM(cost_usd) as total_cost
				FROM requests 
				WHERE cost_usd > 0 AND model IS NOT NULL 
				GROUP BY model 
				ORDER BY total_cost DESC
			`,
			params: [],
		},
		{
			name: "P95 response time calculation",
			query: `
				WITH ordered_times AS (
					SELECT 
						response_time_ms,
						ROW_NUMBER() OVER (ORDER BY response_time_ms) as row_num,
						COUNT(*) OVER () as total_count
					FROM requests 
					WHERE model = ? AND response_time_ms IS NOT NULL
				)
				SELECT response_time_ms as p95_response_time
				FROM ordered_times
				-- CEIL()/FLOOR() are not builtin SQLite functions in bun:sqlite; portable
				-- ceil(x) for non-negative x = trunc(x) + (x > trunc(x)) (see analytics.repository.ts
				-- for the same fix applied to the production query).
				WHERE row_num = (
					CAST(total_count * 0.95 AS INTEGER) +
					(total_count * 0.95 > CAST(total_count * 0.95 AS INTEGER))
				)
				LIMIT 1
			`,
			params: ["claude-3-5-sonnet-20241022"],
		},
	];

	// Run each test query with EXPLAIN QUERY PLAN
	for (const test of testQueries) {
		log.info(`\n--- ${test.name} ---`);

		try {
			// Get query plan
			const planStmt = db.prepare(`EXPLAIN QUERY PLAN ${test.query}`);
			const plan = planStmt.all(...test.params);
			log.info("Query Plan:");
			for (const row of plan) {
				log.info(`  ${JSON.stringify(row)}`);
			}

			// Time the actual query
			const start = performance.now();
			const stmt = db.prepare(test.query);
			const result = stmt.all(...test.params);
			const duration = performance.now() - start;

			log.info(`Execution time: ${duration.toFixed(2)}ms`);
			log.info(`Rows returned: ${result.length}`);
		} catch (error) {
			log.error(`Error: ${error}`);
		}
	}
}

/**
 * Show index statistics
 */
function showIndexStats(db: Database) {
	log.info("\n=== Index Statistics ===\n");

	// Get index list with size estimates
	const indexes = db
		.prepare(`
			SELECT 
				m.name as index_name,
				m.tbl_name as table_name,
				m.sql as create_sql,
				s.stat as stat_value
			FROM sqlite_master m
			LEFT JOIN sqlite_stat1 s ON m.name = s.idx
			WHERE m.type = 'index' 
				AND m.name NOT LIKE 'sqlite_%'
				AND m.name LIKE 'idx_%'
			ORDER BY m.tbl_name, m.name
		`)
		.all() as Array<{
		index_name: string;
		table_name: string;
		create_sql: string;
		stat_value: string | null;
	}>;

	log.info(`Total performance indexes: ${indexes.length}\n`);

	let currentTable = "";
	for (const index of indexes) {
		if (index.table_name !== currentTable) {
			currentTable = index.table_name;
			log.info(`\n${currentTable}:`);
		}
		log.info(`  - ${index.index_name}`);
		if (index.stat_value) {
			log.info(`    Stats: ${index.stat_value}`);
		}
	}

	// Run ANALYZE to update statistics
	log.info("\nRunning ANALYZE to update statistics...");
	db.exec("ANALYZE");
	log.info("Statistics updated.");
}

/**
 * Main function
 */
export function analyzeDatabasePerformance(dbOps: DatabaseOperations): void {
	const db = dbOps.getDatabase();
	log.info("\n=== Database Performance Analysis ===\n");
	analyzeIndexUsage(db);
	showIndexStats(db);
	analyzeQueryPerformance(db);
	log.info("\n=== Analysis Complete ===\n");
}

function main() {
	const dbPath = resolveDbPath();
	log.info(`Analyzing database at: ${dbPath}\n`);

	const db = new Database(dbPath, { readonly: true });

	try {
		analyzeIndexUsage(db);
		showIndexStats(db);
		analyzeQueryPerformance(db);
		log.info("\n=== Analysis Complete ===\n");
	} finally {
		db.close();
	}
}

// Run if called directly
if (import.meta.main) {
	main();
}
