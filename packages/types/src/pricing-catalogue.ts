import type { AccountProvider } from "./provider-metadata";

/**
 * How one ccflare provider's model ids map onto the models.dev catalogue.
 *
 * Pricing itself is never stored here. ccflare has a single price source --
 * the models.dev catalogue fetched by `@ccflare/core`'s pricing module -- and
 * this file only says *where in that catalogue to look*. Rates therefore stay
 * current without anyone editing this repo.
 *
 * Two facts need expressing:
 *
 * 1. `catalogues` -- which catalogue provider blocks to consult first. The
 *    catalogue is keyed by provider, and the same model id appears under many
 *    resellers at different rates, so an unordered scan would price a request
 *    at whichever block happened to come first in the JSON. Naming the
 *    first-party block makes the lookup deterministic.
 * 2. `modelAliases` -- the catalogue id for a model whose ccflare-visible id
 *    differs. Subscription plans are the reason this exists: they publish
 *    plan-specific ids that the catalogue lists at zero cost because the plan
 *    is flat-rate. Aliasing them onto the metered id records what the traffic
 *    would have cost at list price, which is what makes providers comparable
 *    in the dashboard.
 */
export interface ProviderPricingSource {
	/** Catalogue provider blocks to consult, in order, before a full scan. */
	readonly catalogues: readonly string[];
	/** ccflare model id -> models.dev model id, for ids that differ. */
	readonly modelAliases?: Readonly<Record<string, string>>;
}

/**
 * Kimi Code is a flat-rate subscription. models.dev carries its plan ids under
 * a `kimi-for-coding` block priced at zero, so without these aliases every Kimi
 * request records $0 and cannot be compared against any other provider.
 *
 * The targets are Moonshot's own metered ids. `k3-256k` is the same model as
 * `k3` behind a smaller context limit and Moonshot does not price it
 * separately, so both alias to `kimi-k3`.
 */
const KIMI_MODEL_ALIASES: Record<string, string> = {
	"kimi-for-coding": "kimi-k2.7-code",
	"kimi-for-coding-highspeed": "kimi-k2.7-code-highspeed",
	k3: "kimi-k3",
	"k3-256k": "kimi-k3",
};

const PROVIDER_PRICING_SOURCES: Readonly<
	Record<AccountProvider, ProviderPricingSource>
> = {
	anthropic: { catalogues: ["anthropic"] },
	openai: { catalogues: ["openai"] },
	"claude-code": { catalogues: ["anthropic"] },
	codex: { catalogues: ["openai"] },
	kimi: { catalogues: ["moonshotai"], modelAliases: KIMI_MODEL_ALIASES },
};

/** Where to price one model id, given the account provider that served it. */
export interface PricingCatalogueLookup {
	/** Model id to look up in the catalogue. */
	readonly modelId: string;
	/** Catalogue provider blocks to try first, in order. */
	readonly catalogues: readonly string[];
}

function isKnownProvider(
	provider: string | undefined,
): provider is AccountProvider {
	return provider !== undefined && provider in PROVIDER_PRICING_SOURCES;
}

/**
 * Resolve a request's model id to its catalogue coordinates.
 *
 * An unknown or absent provider is not an error: the caller then does a plain
 * catalogue-wide lookup on the id as sent, which is the pre-existing behavior.
 */
export function resolvePricingCatalogueLookup(
	modelId: string,
	provider?: string,
): PricingCatalogueLookup {
	if (!isKnownProvider(provider)) {
		return { modelId, catalogues: [] };
	}

	const source = PROVIDER_PRICING_SOURCES[provider];
	return {
		modelId: source.modelAliases?.[modelId] ?? modelId,
		catalogues: source.catalogues,
	};
}
