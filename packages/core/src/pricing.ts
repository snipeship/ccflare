import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePricingCatalogueLookup } from "@ccflare/types";
import { TIME_CONSTANTS } from "./constants";

export interface TokenBreakdown {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
}

interface ModelCost {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
}

interface ModelDef {
	id: string;
	name: string;
	cost?: ModelCost;
}

interface ApiResponse {
	[provider: string]: {
		models?: {
			[modelId: string]: ModelDef;
		};
	};
}

interface Logger {
	warn(message: string, ...args: unknown[]): void;
}

class PriceCatalogue {
	private static instance: PriceCatalogue;
	private priceData: ApiResponse | null = null;
	private lastFetch = 0;
	private warnedModels = new Set<string>();
	private logger: Logger | null = null;

	private constructor() {}

	setLogger(logger: Logger): void {
		this.logger = logger;
	}

	static get(): PriceCatalogue {
		if (!PriceCatalogue.instance) {
			PriceCatalogue.instance = new PriceCatalogue();
		}
		return PriceCatalogue.instance;
	}

	private getCacheDir(): string {
		return join(tmpdir(), "ccflare");
	}

	private getCachePath(): string {
		return join(this.getCacheDir(), "models.dev.json");
	}

	private getCacheDurationMs(): number {
		const hours = Number(process.env.CF_PRICING_REFRESH_HOURS) || 24;
		return hours * TIME_CONSTANTS.HOUR;
	}

	private async ensureCacheDir(): Promise<void> {
		try {
			await fs.mkdir(this.getCacheDir(), { recursive: true });
		} catch (error) {
			this.logger?.warn("Failed to create cache directory: %s", error);
		}
	}

	private async loadFromCache(): Promise<ApiResponse | null> {
		try {
			const cachePath = this.getCachePath();
			const stats = await fs.stat(cachePath);
			const age = Date.now() - stats.mtime.getTime();

			if (age < this.getCacheDurationMs()) {
				const content = await fs.readFile(cachePath, "utf-8");
				return JSON.parse(content);
			}
		} catch {
			// Cache miss or error - that's ok
		}
		return null;
	}

	private async saveToCache(data: ApiResponse): Promise<void> {
		try {
			await this.ensureCacheDir();
			const cachePath = this.getCachePath();
			await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
		} catch (error) {
			this.logger?.warn("Failed to save pricing cache: %s", error);
		}
	}

	private async fetchRemote(): Promise<ApiResponse | null> {
		try {
			const response = await fetch("https://models.dev/api.json");
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const data = await response.json();
			await this.saveToCache(data);
			return data;
		} catch (error) {
			this.logger?.warn("Failed to fetch pricing data: %s", error);
			return null;
		}
	}

	async getPricing(): Promise<ApiResponse> {
		// Return cached data if available
		if (
			this.priceData &&
			Date.now() - this.lastFetch < this.getCacheDurationMs()
		) {
			return this.priceData;
		}

		// Always attempt to fetch fresh pricing first (once per process start)
		let data = await this.fetchRemote();

		// If remote fetch failed (offline or error), fall back to disk cache
		if (!data) {
			data = await this.loadFromCache();
		}

		// If there is no remote or cached catalogue, return an empty catalogue.
		if (!data) {
			data = {};
		}

		this.priceData = data;
		this.lastFetch = Date.now();
		return data;
	}

	reset(): void {
		this.priceData = null;
		this.lastFetch = 0;
		this.warnedModels.clear();
	}

	warnOnce(modelId: string): void {
		if (!this.warnedModels.has(modelId)) {
			this.warnedModels.add(modelId);
			this.logger?.warn(
				"Price for model %s not found - cost set to 0",
				modelId,
			);
		}
	}
}

/**
 * Set the logger for pricing warnings
 */
export function setPricingLogger(logger: Logger): void {
	PriceCatalogue.get().setLogger(logger);
}

/**
 * Drop the in-memory catalogue so the next estimate refetches.
 *
 * The catalogue is a process-wide singleton with a 24h memory cache, which
 * tests would otherwise carry between cases.
 */
export function resetPricingCatalogue(): void {
	PriceCatalogue.get().reset();
}

/**
 * Look up a model's rates, preferring the named catalogue blocks.
 *
 * The catalogue lists the same model id under many resellers at different
 * rates, and object key order is not a pricing decision, so the provider's
 * first-party blocks are consulted first. The catalogue-wide scan remains as a
 * fallback for ids ccflare has no provider hint for.
 */
function findModelCost(
	pricing: ApiResponse,
	modelId: string,
	preferredCatalogues: readonly string[] = [],
): ModelCost | null {
	for (const catalogue of preferredCatalogues) {
		const model = pricing[catalogue]?.models?.[modelId];
		if (model?.cost) {
			return model.cost;
		}
	}

	for (const provider of Object.values(pricing)) {
		const model = provider.models?.[modelId];
		if (model?.cost) {
			return model.cost;
		}
	}
	return null;
}

/**
 * Estimate the total cost in USD for a request based on token counts.
 *
 * Passing the account provider that served the request lets subscription model
 * ids resolve to their metered equivalent and keeps ambiguous ids on the
 * first-party catalogue block. Costs are list-price equivalents, not billed
 * amounts: a flat-rate subscription account bills nothing per request.
 *
 * @returns Cost in dollars (NOT per million)
 */
export async function estimateCostUSD(
	modelId: string,
	tokens: TokenBreakdown,
	options: { provider?: string } = {},
): Promise<number> {
	const catalogue = PriceCatalogue.get();

	try {
		const pricing = await catalogue.getPricing();
		const normalizedModelId = modelId.trim();
		if (!normalizedModelId) {
			throw new Error("Model id is empty");
		}

		const lookup = resolvePricingCatalogueLookup(
			normalizedModelId,
			options.provider,
		);
		const cost = findModelCost(pricing, lookup.modelId, lookup.catalogues);
		if (!cost) {
			throw new Error(`Model ${lookup.modelId} not found in pricing catalogue`);
		}

		let totalCost = 0;

		if (tokens.inputTokens && cost.input !== undefined) {
			totalCost += tokens.inputTokens * (cost.input / 1_000_000);
		}

		if (tokens.outputTokens && cost.output !== undefined) {
			totalCost += tokens.outputTokens * (cost.output / 1_000_000);
		}

		if (tokens.cacheReadInputTokens && cost.cache_read !== undefined) {
			totalCost += tokens.cacheReadInputTokens * (cost.cache_read / 1_000_000);
		}

		if (tokens.cacheCreationInputTokens && cost.cache_write !== undefined) {
			totalCost +=
				tokens.cacheCreationInputTokens * (cost.cache_write / 1_000_000);
		}

		return totalCost;
	} catch (_error) {
		catalogue.warnOnce(modelId);
		return 0;
	}
}
