import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import {
	generatePKCE,
	getOAuthProvider as getRegisteredOAuthProvider,
	type OAuthProvider,
	type OAuthProviderConfig,
	type OAuthTokens,
	type PKCEChallenge,
} from "@ccflare/providers";
import {
	isOAuthProvider,
	isRecord,
	type OAuthProvider as OAuthFlowProvider,
} from "@ccflare/types";

export {
	isOAuthProvider as isOAuthFlowProvider,
	type OAuthProvider as OAuthFlowProvider,
} from "@ccflare/types";

/**
 * Resolves the OAuthProvider implementation via the provider registry
 * rather than hardcoding class constructors. The registry is populated
 * at import time by @ccflare/providers.
 */
function getOAuthProviderForFlow(provider: OAuthFlowProvider): OAuthProvider {
	const oauthProvider = getRegisteredOAuthProvider(provider);
	if (!oauthProvider) {
		throw new Error(
			`No OAuth provider registered for '${provider}'. Ensure @ccflare/providers is imported.`,
		);
	}
	return oauthProvider;
}

function getOAuthConfigForFlow(
	provider: OAuthFlowProvider,
	config: Config,
	oauthProvider: OAuthProvider,
): OAuthProviderConfig {
	const oauthConfig = oauthProvider.getOAuthConfig();

	if (provider === "claude-code") {
		oauthConfig.clientId = config.getRuntime().clientId;
	}

	return oauthConfig;
}

export interface BeginOptions {
	name: string;
	provider: OAuthFlowProvider;
}

export interface BeginResult {
	sessionId: string;
	authUrl: string;
	pkce: PKCEChallenge;
	oauthConfig: OAuthProviderConfig;
	/**
	 * Device-grant providers only: the short code the user confirms in the
	 * browser. Present so UIs can display it alongside the verification URL.
	 */
	userCode?: string;
}

export interface CompleteOptions {
	sessionId: string;
	/**
	 * Authorization code. Empty for device-grant providers, which poll the
	 * token endpoint with the stored device code instead.
	 */
	code: string;
	name?: string;
}

export interface AccountCreated {
	id: string;
	name: string;
	provider: OAuthFlowProvider;
	authType: "oauth";
}

interface SessionState {
	verifier: string;
	state: string;
	status: "pending" | "completed";
}

/**
 * Handles OAuth flows for OAuth-only providers and persists transient auth
 * session state in the generic auth_sessions table.
 */
export class OAuthFlow {
	constructor(
		private dbOps: DatabaseOperations,
		private config: Config,
	) {}

	/**
	 * Starts an OAuth flow for an OAuth-only provider.
	 *
	 * @param opts - OAuth flow options
	 * @param opts.name - Unique account name
	 * @returns OAuth flow data including auth URL and session info
	 * @throws {Error} If account name already exists
	 */
	async begin(opts: BeginOptions): Promise<BeginResult> {
		const { name, provider } = opts;

		// Check if account already exists
		if (this.dbOps.getAccountByName(name)) {
			throw new Error(`Account with name '${name}' already exists`);
		}

		// Get OAuth provider
		const oauthProvider = getOAuthProviderForFlow(provider);

		// Get OAuth config with provider-specific client ID handling
		const oauthConfig = getOAuthConfigForFlow(
			provider,
			this.config,
			oauthProvider,
		);

		// Device-grant providers (e.g. Kimi) have no redirect and no PKCE: the
		// device code takes the verifier slot and is polled in complete().
		if (oauthProvider.beginDeviceAuthorization) {
			const device = await oauthProvider.beginDeviceAuthorization(oauthConfig);
			const pkce: PKCEChallenge = {
				verifier: device.deviceCode,
				challenge: "",
			};
			const sessionState: SessionState = {
				verifier: device.deviceCode,
				// No redirect callback matches on state here, but the column is
				// required and must stay unique across sessions.
				state: crypto.randomUUID(),
				status: "pending",
			};

			const sessionId = this.dbOps.createAuthSession(
				provider,
				"oauth",
				name,
				JSON.stringify(sessionState),
				device.expiresAt,
			);

			return {
				sessionId,
				authUrl: device.verificationUriComplete,
				pkce,
				oauthConfig,
				userCode: device.userCode,
			};
		}

		// Generate PKCE challenge
		const pkce = await generatePKCE();

		// Generate auth URL
		const authUrl = oauthProvider.generateAuthUrl(oauthConfig, pkce);

		const sessionState: SessionState = {
			verifier: pkce.verifier,
			state: pkce.verifier,
			status: "pending",
		};

		const sessionId = this.dbOps.createAuthSession(
			provider,
			"oauth",
			name,
			JSON.stringify(sessionState),
			Date.now() + 10 * 60 * 1000,
		);

		return {
			sessionId,
			authUrl,
			pkce,
			oauthConfig,
		};
	}

	/**
	 * Completes the OAuth flow after user authorization.
	 *
	 * @param opts - Completion options
	 * @param opts.sessionId - Session ID from {@link begin}
	 * @param opts.code - Authorization code from OAuth callback
	 * @param opts.name - Account name (must match the one from begin)
	 * @returns Created account information
	 * @throws {Error} If OAuth provider not found or token exchange fails
	 */
	async complete(
		opts: CompleteOptions,
		flowData?: BeginResult,
	): Promise<AccountCreated> {
		const { sessionId, code } = opts;
		const authSession = this.dbOps.getAuthSession(sessionId);
		if (!authSession) {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		if (
			!isOAuthProvider(authSession.provider) ||
			authSession.authMethod !== "oauth"
		) {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		const sessionState = this.parseSessionState(authSession.stateJson);
		const provider = authSession.provider;
		const name = opts.name ?? authSession.accountName;

		if (sessionState.status === "completed") {
			const existingAccount = this.dbOps.getAccountByName(name);

			if (
				existingAccount &&
				existingAccount.provider === provider &&
				existingAccount.auth_method === "oauth"
			) {
				return {
					id: existingAccount.id,
					name: existingAccount.name,
					provider,
					authType: "oauth",
				};
			}

			throw new Error("OAuth session has already been completed.");
		}

		const resolvedFlowData =
			flowData ??
			this.createFlowDataFromSession(sessionId, provider, sessionState);

		// Get OAuth provider
		const oauthProvider = getOAuthProviderForFlow(provider);

		// Exchange authorization code for tokens
		const tokens = await oauthProvider.exchangeCode(
			code,
			resolvedFlowData.pkce.verifier,
			resolvedFlowData.oauthConfig,
		);

		const account = this.createAccountWithOAuth(name, provider, tokens);
		this.dbOps.updateAuthSessionState(
			sessionId,
			JSON.stringify({
				...sessionState,
				status: "completed",
			} satisfies SessionState),
			Date.now() + 5 * 60 * 1000,
		);
		return account;
	}

	private createFlowDataFromSession(
		sessionId: string,
		provider: OAuthFlowProvider,
		sessionState: SessionState,
	): BeginResult {
		const oauthProvider = getOAuthProviderForFlow(provider);
		const oauthConfig = getOAuthConfigForFlow(
			provider,
			this.config,
			oauthProvider,
		);

		return {
			sessionId,
			authUrl: "",
			pkce: {
				verifier: sessionState.verifier,
				challenge: "",
			},
			oauthConfig,
		};
	}

	private parseSessionState(stateJson: string): SessionState {
		let parsed: unknown;
		try {
			parsed = JSON.parse(stateJson);
		} catch {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		if (!isRecord(parsed) || typeof parsed.verifier !== "string") {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		if (typeof parsed.state !== "string") {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		if (parsed.status !== "pending" && parsed.status !== "completed") {
			throw new Error("OAuth session expired or invalid. Please try again.");
		}

		return {
			verifier: parsed.verifier,
			state: parsed.state,
			status: parsed.status,
		};
	}

	private createAccountWithOAuth(
		name: string,
		provider: OAuthFlowProvider,
		tokens: OAuthTokens,
	): AccountCreated {
		const account = this.dbOps.createOAuthAccount({
			name,
			provider,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken ?? null,
			expiresAt: tokens.expiresAt,
		});

		return {
			id: account.id,
			name: account.name,
			provider,
			authType: "oauth",
		};
	}
}

// Helper function for simpler usage
export async function createOAuthFlow(
	dbOps: DatabaseOperations,
	config: Config,
): Promise<OAuthFlow> {
	return new OAuthFlow(dbOps, config);
}
