import { Config } from "@ccflare/config";
import { DatabaseFactory } from "@ccflare/database";
import {
	type BeginResult,
	createOAuthFlow,
	isOAuthFlowProvider,
} from "@ccflare/oauth-flow";
import {
	ACCOUNT_PROVIDER_OPTIONS,
	type AddAccountOptions,
	type ApiKeyProvider,
	type AuthMethod,
	getProviderAuthMethod,
	getProviderDisplayLabel,
	isDeviceCodeProvider,
	type OAuthProvider,
} from "@ccflare/types";
import type { AccountDisplay } from "@ccflare/ui";
import * as cliCommands from "./cli";
import { openBrowser } from "./cli";

export interface AddAccountProviderOption {
	label: string;
	value: AddAccountOptions["provider"];
	authMethod: AuthMethod;
}

export type PreparedAddAccount =
	| {
			authMethod: "api_key";
			provider: ApiKeyProvider;
	  }
	| {
			authMethod: "oauth";
			provider: OAuthProvider;
			flowData: BeginResult;
	  };

export function getAddAccountProviderOptions(): AddAccountProviderOption[] {
	return ACCOUNT_PROVIDER_OPTIONS.map((provider) => ({
		...provider,
		authMethod: getProviderAuthMethod(provider.value),
	}));
}

async function openAuthUrl(authUrl: string): Promise<void> {
	console.log("\nOpening browser to authenticate...");
	const browserOpened = await openBrowser(authUrl);
	if (!browserOpened) {
		console.log(`Please open the following URL in your browser:\n${authUrl}`);
	}
}

/**
 * Prepare account creation by resolving the provider auth method once.
 * OAuth providers start the browser flow here; API key providers return
 * immediately so the caller can collect the key in the UI.
 */
export async function prepareAddAccount(
	options: AddAccountOptions,
): Promise<PreparedAddAccount> {
	const { name, provider } = options;

	if (!isOAuthFlowProvider(provider)) {
		return {
			authMethod: "api_key",
			provider,
		};
	}

	const config = new Config();
	const dbOps = DatabaseFactory.getInstance();
	const oauthFlow = await createOAuthFlow(dbOps, config);
	const flowData = await oauthFlow.begin({
		name,
		provider,
	});

	await openAuthUrl(flowData.authUrl);

	return {
		authMethod: "oauth",
		provider,
		flowData,
	};
}

export async function submitAddAccount(
	options: AddAccountOptions & {
		apiKey?: string;
		code?: string;
		flowData?: BeginResult;
	},
): Promise<void> {
	const { name, provider, apiKey, code, flowData } = options;
	const dbOps = DatabaseFactory.getInstance();

	if (!isOAuthFlowProvider(provider)) {
		if (!apiKey) {
			throw new Error("API key is required for API key providers.");
		}

		dbOps.createApiKeyAccount({
			name,
			provider,
			apiKey,
		});
		return;
	}

	const deviceGrant = isDeviceCodeProvider(provider);
	if (!flowData || (!code && !deviceGrant)) {
		throw new Error("Authorization code is required for OAuth providers.");
	}

	const config = new Config();
	const oauthFlow = await createOAuthFlow(dbOps, config);

	console.log(
		deviceGrant
			? "\nWaiting for you to approve in the browser..."
			: "\nExchanging code for tokens...",
	);
	await oauthFlow.complete(
		{ sessionId: flowData.sessionId, code: code ?? "", name },
		flowData,
	);

	console.log(`\nAccount '${name}' added successfully!`);
	console.log(`Provider: ${getProviderDisplayLabel(provider)}`);
	console.log(`Auth Method: ${getProviderAuthMethod(provider)}`);
}

export async function addAccount(options: AddAccountOptions): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	const config = new Config();
	await cliCommands.addAccount(dbOps, config, {
		name: options.name,
		provider: options.provider,
	});
}

export async function getAccounts(): Promise<AccountDisplay[]> {
	const dbOps = DatabaseFactory.getInstance();
	return await cliCommands.getAccountsList(dbOps);
}

export async function removeAccount(name: string): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	await cliCommands.removeAccount(dbOps, name);
}

export async function pauseAccount(
	name: string,
): Promise<{ success: boolean; message: string }> {
	const dbOps = DatabaseFactory.getInstance();
	const account = dbOps.getAccountByName(name);

	if (!account) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	if (account.paused) {
		return {
			success: false,
			message: `Account '${name}' is already paused`,
		};
	}

	dbOps.pauseAccount(account.id);
	return {
		success: true,
		message: `Account '${name}' paused successfully`,
	};
}

export async function resumeAccount(
	name: string,
): Promise<{ success: boolean; message: string }> {
	const dbOps = DatabaseFactory.getInstance();
	const account = dbOps.getAccountByName(name);

	if (!account) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	if (!account.paused) {
		return {
			success: false,
			message: `Account '${name}' is already resumed`,
		};
	}

	dbOps.resumeAccount(account.id);
	return {
		success: true,
		message: `Account '${name}' resumed successfully`,
	};
}
