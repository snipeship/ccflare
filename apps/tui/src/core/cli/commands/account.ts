import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import { createOAuthFlow, isOAuthFlowProvider } from "@ccflare/oauth-flow";
import {
	ACCOUNT_PROVIDERS,
	type AccountProvider,
	getProviderAuthMethod,
	getProviderDisplayLabel,
	isAccountProvider,
	isDeviceCodeProvider,
} from "@ccflare/types";
import { type AccountDisplay, toAccountDisplay } from "@ccflare/ui";
import type { PromptAdapter } from "../prompts/adapter";
import { stdPromptAdapter } from "../prompts/std-adapter";
import { openBrowser } from "../utils/browser";

export interface AddAccountOptions {
	name: string;
	provider: AccountProvider;
	adapter?: PromptAdapter;
}

export function formatAccountsTable(accounts: AccountDisplay[]): string[] {
	const header =
		"Name".padEnd(20) +
		"Provider".padEnd(14) +
		"Auth Method".padEnd(14) +
		"Weight".padEnd(8) +
		"Requests".padEnd(12) +
		"Token".padEnd(10) +
		"Status".padEnd(20) +
		"Session";
	const separator = "─".repeat(header.length);

	return [
		`Accounts (${accounts.length}):`,
		header,
		separator,
		...accounts.map((account) => {
			return (
				account.name.padEnd(20) +
				account.provider.padEnd(14) +
				account.auth_method.padEnd(14) +
				account.weightDisplay.padEnd(8) +
				`${account.requestCount}/${account.totalRequests}`.padEnd(12) +
				account.tokenStatus.padEnd(10) +
				account.rateLimitStatus.padEnd(20) +
				account.sessionInfo
			);
		}),
	];
}

/**
 * Add a new account using provider-specific auth flow
 */
export async function addAccount(
	dbOps: DatabaseOperations,
	config: Config,
	options: AddAccountOptions,
): Promise<void> {
	const { name, provider, adapter = stdPromptAdapter } = options;

	if (!isAccountProvider(provider)) {
		throw new Error(
			`Unsupported provider '${provider}'. Supported providers: ${ACCOUNT_PROVIDERS.join(", ")}.`,
		);
	}

	if (!isOAuthFlowProvider(provider)) {
		const apiKey = await adapter.input("\nEnter the API key: ", true);

		dbOps.createApiKeyAccount({
			name,
			provider,
			apiKey,
		});

		console.log(`\nAccount '${name}' added successfully!`);
		console.log(`Provider: ${getProviderDisplayLabel(provider)}`);
		console.log(`Auth Method: ${getProviderAuthMethod(provider)}`);
		return;
	}

	// Create OAuth flow instance
	const oauthFlow = await createOAuthFlow(dbOps, config);

	// Begin OAuth flow
	const flowResult = await oauthFlow.begin({
		name,
		provider,
	});
	const { authUrl, sessionId, userCode } = flowResult;

	// Open browser to authenticate
	console.log(`\nOpening browser to authenticate...`);
	console.log(`URL: ${authUrl}`);
	const browserOpened = await openBrowser(authUrl);
	if (!browserOpened) {
		console.log(
			`\nFailed to open browser automatically. Please manually open the URL above.`,
		);
	}

	// Device-grant providers return no code to paste: approve in the browser
	// and the token endpoint is polled until it hands over tokens.
	const deviceGrant = isDeviceCodeProvider(provider);
	let code = "";
	if (deviceGrant) {
		if (userCode) {
			console.log(`\nVerification code: ${userCode}`);
		}
		console.log("\nWaiting for you to approve in the browser...");
	} else {
		code = await adapter.input("\nEnter the authorization code: ");
		console.log("\nExchanging code for tokens...");
	}
	const _account = await oauthFlow.complete(
		{ sessionId, code, name },
		flowResult,
	);

	console.log(`\nAccount '${name}' added successfully!`);
	console.log(`Provider: ${getProviderDisplayLabel(provider)}`);
	console.log(`Auth Method: ${getProviderAuthMethod(provider)}`);
}

/**
 * Get list of all accounts with formatted information
 */
export function getAccountsList(dbOps: DatabaseOperations): AccountDisplay[] {
	const accounts = dbOps.getAllAccounts();
	const now = Date.now();

	return accounts.map((account) => toAccountDisplay(account, now));
}

/**
 * Remove an account by name
 */
export function removeAccount(
	dbOps: DatabaseOperations,
	name: string,
): { success: boolean; message: string } {
	const account = dbOps.getAccountByName(name);

	if (!account || !dbOps.deleteAccount(account.id)) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	return {
		success: true,
		message: `Account '${name}' removed successfully`,
	};
}
