// Export all types

// Export base provider class
export { BaseProvider } from "./base";
// Export OAuth utilities
export * from "./oauth";
// Export providers
export * from "./providers/index";
// Export registry functions
export {
	createProviderRegistry,
	getOAuthProvider,
	ProviderRegistry,
	registerProvider,
	registry as providerRegistry,
	resolveProvider,
} from "./registry";
export * from "./types";

import { AnthropicProvider } from "./providers/anthropic/provider";
import { ClaudeCodeProvider } from "./providers/claude-code/provider";
import { CodexProvider } from "./providers/codex/provider";
import { KimiProvider } from "./providers/kimi/provider";
import { OpenAIProvider } from "./providers/openai/provider";
// Auto-register built-in providers
import { registerProvider } from "./registry";

registerProvider(new AnthropicProvider());
registerProvider(new OpenAIProvider());
registerProvider(new ClaudeCodeProvider());
registerProvider(new CodexProvider());
registerProvider(new KimiProvider());
