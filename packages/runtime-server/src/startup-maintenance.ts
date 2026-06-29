import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";

export function runStartupMaintenance(
	config: Config,
	dbOps: DatabaseOperations,
): () => void {
	const log = new Logger("StartupMaintenance");

	try {
		const payloadDays = config.getDataRetentionDays();
		const requestDays = config.getRequestRetentionDays();
		const { removedRequests, removedPayloads } = dbOps.cleanupOldRequests(
			payloadDays * 24 * 60 * 60 * 1000,
			requestDays * 24 * 60 * 60 * 1000,
		);
		log.info(
			`Startup cleanup removed ${removedRequests} requests and ${removedPayloads} payloads (payload=${payloadDays}d, requests=${requestDays}d)`,
		);
	} catch (err) {
		log.error(`Startup cleanup error: ${err}`);
	}

	log.info(
		"Skipping startup database compaction; run manual compaction during idle time",
	);

	return () => {};
}
