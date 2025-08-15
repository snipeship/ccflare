import { registerDisposable, unregisterDisposable } from "@ccflare/core";
import { DatabaseOperations, type RuntimeConfig } from "./index";
import type { MigrationProgress } from "./migrations";

let instance: DatabaseOperations | null = null;
let dbPath: string | undefined;
let runtimeConfig: RuntimeConfig | undefined;
let migrationProgressCallback:
	| ((progress: MigrationProgress) => void)
	| undefined;

export function initialize(
	dbPathParam?: string,
	runtimeConfigParam?: RuntimeConfig,
	onMigrationProgress?: (progress: MigrationProgress) => void,
): void {
	dbPath = dbPathParam;
	runtimeConfig = runtimeConfigParam;
	migrationProgressCallback = onMigrationProgress;
}

export function getInstance(): DatabaseOperations {
	if (!instance) {
		instance = new DatabaseOperations(dbPath, migrationProgressCallback);
		if (runtimeConfig) {
			instance.setRuntimeConfig(runtimeConfig);
		}
		// Register with lifecycle manager
		registerDisposable(instance);
	}
	return instance;
}

export function closeAll(): void {
	if (instance) {
		unregisterDisposable(instance);
		instance.close();
		instance = null;
	}
}

export function reset(): void {
	closeAll();
}

export function createDbOps(
	dbPath?: string,
	onMigrationProgress?: (progress: MigrationProgress) => void,
): DatabaseOperations {
	return new DatabaseOperations(dbPath, onMigrationProgress);
}

export const DatabaseFactory = {
	initialize,
	getInstance,
	closeAll,
	reset,
	createDbOps,
};
