const PROVIDER_METADATA_MAP = {
	anthropic: {
		displayLabel: "Anthropic",
		authMethod: "api_key",
		supportsOAuth: false,
		oauthGrant: "none",
		supportsWebSocket: false,
		defaultBaseUrl: "https://api.anthropic.com",
		specialRequirements: [],
	},
	openai: {
		displayLabel: "OpenAI",
		authMethod: "api_key",
		supportsOAuth: false,
		oauthGrant: "none",
		supportsWebSocket: false,
		defaultBaseUrl: "https://api.openai.com/v1",
		specialRequirements: [],
	},
	"claude-code": {
		displayLabel: "Claude Code",
		authMethod: "oauth",
		supportsOAuth: true,
		oauthGrant: "authorization_code",
		supportsWebSocket: false,
		defaultBaseUrl: "https://api.anthropic.com",
		specialRequirements: ["Requires Claude Code OAuth authentication"],
	},
	codex: {
		displayLabel: "Codex",
		authMethod: "oauth",
		supportsOAuth: true,
		oauthGrant: "authorization_code",
		supportsWebSocket: true,
		defaultBaseUrl: "https://chatgpt.com/backend-api/codex",
		specialRequirements: ["Requires Codex OAuth authentication"],
	},
	kimi: {
		displayLabel: "Kimi Code",
		authMethod: "oauth",
		supportsOAuth: true,
		oauthGrant: "device_code",
		supportsWebSocket: false,
		defaultBaseUrl: "https://api.kimi.com/coding/v1",
		specialRequirements: [
			"Requires Kimi Code OAuth device authorization (approve in browser, no code to paste)",
		],
	},
} as const satisfies Record<
	string,
	{
		displayLabel: string;
		authMethod: "api_key" | "oauth";
		supportsOAuth: boolean;
		oauthGrant: OAuthGrant;
		supportsWebSocket: boolean;
		defaultBaseUrl: string;
		specialRequirements: readonly string[];
	}
>;

/**
 * Which OAuth grant a provider's onboarding uses.
 *
 * `authorization_code` hands the user a redirect URL and expects an
 * authorization code back. `device_code` hands the user a verification URL and
 * polls the token endpoint instead -- there is no code for the user to paste.
 */
export type OAuthGrant = "none" | "authorization_code" | "device_code";

type ProviderMetadataMap = typeof PROVIDER_METADATA_MAP;

export type AccountProvider = keyof ProviderMetadataMap;
export type AuthMethod = ProviderMetadataMap[AccountProvider]["authMethod"];
export type ProviderByAuthMethod<T extends AuthMethod> = {
	[K in AccountProvider]: ProviderMetadataMap[K]["authMethod"] extends T
		? K
		: never;
}[AccountProvider];
export type ApiKeyProvider = ProviderByAuthMethod<"api_key">;
export type OAuthProvider = ProviderByAuthMethod<"oauth">;
export type ProviderMetadata<P extends AccountProvider = AccountProvider> = {
	canonicalName: P;
} & ProviderMetadataMap[P];

const providerNames = Object.freeze(
	Object.keys(PROVIDER_METADATA_MAP) as AccountProvider[],
);
const authMethods = Object.freeze(
	Array.from(
		new Set(
			providerNames.map(
				(provider) => PROVIDER_METADATA_MAP[provider].authMethod,
			),
		),
	) as AuthMethod[],
);
const providerOptions = Object.freeze(
	providerNames.map((provider) => ({
		value: provider,
		label: PROVIDER_METADATA_MAP[provider].displayLabel,
	})),
);

/**
 * Cross-package provider metadata registry.
 * Single source of truth for provider capability facts that multiple packages
 * need (auth method, OAuth support, WebSocket support, display label, etc.).
 *
 * This is a simple Record, NOT a framework. Provider-specific runtime behavior
 * (request shaping, rate-limit parsing, etc.) stays in the provider classes.
 */
export const PROVIDER_META = PROVIDER_METADATA_MAP;

export const ACCOUNT_PROVIDERS = providerNames;
export const AUTH_METHODS = authMethods;
export const ACCOUNT_PROVIDER_OPTIONS = providerOptions;
export const API_KEY_PROVIDERS = Object.freeze(
	ACCOUNT_PROVIDERS.filter((provider): provider is ApiKeyProvider =>
		isApiKeyProvider(provider),
	),
);
export const OAUTH_PROVIDERS = Object.freeze(
	ACCOUNT_PROVIDERS.filter((provider): provider is OAuthProvider =>
		isOAuthProvider(provider),
	),
);

export function isAccountProvider(value: string): value is AccountProvider {
	return Object.hasOwn(PROVIDER_METADATA_MAP, value);
}

export function isAuthMethod(value: string): value is AuthMethod {
	return AUTH_METHODS.includes(value as AuthMethod);
}

export function isApiKeyProvider(value: string): value is ApiKeyProvider {
	return (
		isAccountProvider(value) &&
		PROVIDER_METADATA_MAP[value].authMethod === "api_key"
	);
}

export function isOAuthProvider(value: string): value is OAuthProvider {
	return (
		isAccountProvider(value) &&
		PROVIDER_METADATA_MAP[value].authMethod === "oauth"
	);
}

/**
 * True when onboarding this provider uses the OAuth device authorization
 * grant, i.e. the user approves in a browser and no code comes back.
 */
export function isDeviceCodeProvider(value: string): value is OAuthProvider {
	return (
		isAccountProvider(value) &&
		PROVIDER_METADATA_MAP[value].oauthGrant === "device_code"
	);
}

export function getProviderOAuthGrant(provider: AccountProvider): OAuthGrant {
	return PROVIDER_METADATA_MAP[provider].oauthGrant;
}

export function getProviderMetadata<P extends AccountProvider>(
	provider: P,
): ProviderMetadata<P> {
	return {
		canonicalName: provider,
		...PROVIDER_METADATA_MAP[provider],
	};
}

export function getProviderDisplayLabel(provider: AccountProvider): string {
	return PROVIDER_METADATA_MAP[provider].displayLabel;
}

export function getProviderAuthMethod(provider: AccountProvider): AuthMethod {
	return PROVIDER_METADATA_MAP[provider].authMethod;
}

export function getProviderDefaultBaseUrl(provider: AccountProvider): string {
	return PROVIDER_METADATA_MAP[provider].defaultBaseUrl;
}

export function getProviderSupportsWebSocket(
	provider: AccountProvider,
): boolean {
	return PROVIDER_METADATA_MAP[provider].supportsWebSocket;
}

export function getProviderSpecialRequirements(
	provider: AccountProvider,
): readonly string[] {
	return PROVIDER_METADATA_MAP[provider].specialRequirements;
}
