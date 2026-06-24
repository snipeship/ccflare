import { BUFFER_SIZES } from "@ccflare/core";
import {
	type Account,
	getProviderDefaultBaseUrl,
	isRecord,
} from "@ccflare/types";
import { BaseProvider, deleteTransportHeaders } from "../../base";
import type { RateLimitInfo } from "../../types";

// Hard rate limit statuses that should block account usage
const HARD_LIMIT_STATUSES = new Set([
	"rate_limited",
	"blocked",
	"queueing_hard",
	"payment_required",
]);

// Soft warning statuses that should not block account usage
const _SOFT_WARNING_STATUSES = new Set(["allowed_warning", "queueing_soft"]);

// When overage is available Anthropic keeps serving requests beyond the primary
// (e.g. 5-hour) limit. A rate-limit hit is then transient, so we apply a short
// cooldown instead of benching the account until the multi-hour primary reset.
const OVERAGE_COOLDOWN_MS = 60_000; // 60 seconds

const PROVIDER_NAME = "anthropic" as const;
const DEFAULT_BASE_URL = getProviderDefaultBaseUrl(PROVIDER_NAME);

function parseAnthropicUsage(value: unknown):
	| {
			input_tokens?: number;
			output_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
	  }
	| undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const parsedUsage = {
		...(typeof value.input_tokens === "number" && {
			input_tokens: value.input_tokens,
		}),
		...(typeof value.output_tokens === "number" && {
			output_tokens: value.output_tokens,
		}),
		...(typeof value.cache_creation_input_tokens === "number" && {
			cache_creation_input_tokens: value.cache_creation_input_tokens,
		}),
		...(typeof value.cache_read_input_tokens === "number" && {
			cache_read_input_tokens: value.cache_read_input_tokens,
		}),
	};

	return Object.keys(parsedUsage).length > 0 ? parsedUsage : undefined;
}

function parseAnthropicMessageEnvelope(value: unknown): {
	message?: {
		model?: string;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
	};
} | null {
	if (!isRecord(value)) {
		return null;
	}

	const usage = parseAnthropicUsage(
		value.message && isRecord(value.message) ? value.message.usage : undefined,
	);
	return {
		...(isRecord(value.message) && {
			message: {
				...(typeof value.message.model === "string" && {
					model: value.message.model,
				}),
				...(usage && { usage }),
			},
		}),
	};
}

export class AnthropicProvider extends BaseProvider {
	name: string = PROVIDER_NAME;
	defaultBaseUrl: string = DEFAULT_BASE_URL;

	prepareHeaders(headers: Headers, account: Account | null): Headers {
		const newHeaders = new Headers(headers);

		if (account?.api_key) {
			newHeaders.set("x-api-key", account.api_key);
		}

		deleteTransportHeaders(newHeaders);

		return newHeaders;
	}

	parseRateLimit(response: Response): RateLimitInfo {
		// Check for unified rate limit headers
		const statusHeader = response.headers.get(
			"anthropic-ratelimit-unified-status",
		);
		const resetHeader = response.headers.get(
			"anthropic-ratelimit-unified-reset",
		);
		const remainingHeader = response.headers.get(
			"anthropic-ratelimit-unified-remaining",
		);
		// Overage lets the account keep serving past its primary limit.
		const overageAvailable =
			response.headers.get("anthropic-ratelimit-unified-overage-status") ===
			"allowed";

		if (statusHeader || resetHeader) {
			const remaining = remainingHeader ? Number(remainingHeader) : undefined;

			// Only mark as rate limited for hard limit statuses or 429
			const isRateLimited =
				HARD_LIMIT_STATUSES.has(statusHeader || "") || response.status === 429;

			// If overage is available, the multi-hour primary-limit reset is not a
			// real lockout — the account can still serve. Use a short cooldown so it
			// fails over briefly and is retried, rather than being benched for hours.
			const resetTime =
				isRateLimited && overageAvailable
					? Date.now() + OVERAGE_COOLDOWN_MS
					: resetHeader
						? Number(resetHeader) * 1000 // Convert to ms
						: undefined;

			return {
				isRateLimited,
				resetTime,
				statusHeader: statusHeader || undefined,
				remaining,
			};
		}

		// Fall back to 429 status with x-ratelimit-reset header
		if (response.status !== 429) {
			return { isRateLimited: false };
		}

		const rateLimitReset = response.headers.get("x-ratelimit-reset");
		const resetTime =
			overageAvailable || !rateLimitReset
				? Date.now() + OVERAGE_COOLDOWN_MS // short cooldown (also the 1-min default)
				: parseInt(rateLimitReset, 10) * 1000;

		return {
			isRateLimited: true,
			resetTime,
		};
	}

	async extractUsageInfo(response: Response): Promise<{
		model?: string;
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
		costUsd?: number;
		inputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		outputTokens?: number;
	} | null> {
		try {
			const clone = response.clone();
			const contentType = response.headers.get("content-type");

			// Handle streaming responses (SSE)
			if (contentType?.includes("text/event-stream")) {
				// Use bounded reader to avoid consuming entire stream
				const reader = clone.body?.getReader();
				if (!reader) return null;

				let buffered = "";
				const maxBytes = BUFFER_SIZES.ANTHROPIC_STREAM_CAP_BYTES;
				const decoder = new TextDecoder();
				let foundMessageStart = false;

				try {
					while (buffered.length < maxBytes) {
						const { value, done } = await reader.read();
						if (done) break;

						buffered += decoder.decode(value, { stream: true });

						// Check if we have the message_start event
						if (buffered.includes("event: message_start")) {
							foundMessageStart = true;
							// Read a bit more to ensure we get the data line
							const { value: nextValue, done: nextDone } = await reader.read();
							if (!nextDone && nextValue) {
								buffered += decoder.decode(nextValue, { stream: true });
							}
							break;
						}
					}
				} finally {
					// Cancel the reader to prevent hanging
					reader.cancel().catch(() => {});
				}

				if (!foundMessageStart) return null;

				// Parse the buffered content
				const lines = buffered.split("\n");

				// Parse SSE events
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (line.startsWith("event: message_start")) {
						// Next line should be the data
						const dataLine = lines[i + 1];
						if (dataLine?.startsWith("data: ")) {
							try {
								const jsonStr = dataLine.slice(6); // Remove "data: " prefix
								const data = parseAnthropicMessageEnvelope(JSON.parse(jsonStr));

								if (data?.message?.usage) {
									const usage = data.message.usage;
									const inputTokens = usage.input_tokens ?? 0;
									const cacheCreationInputTokens =
										usage.cache_creation_input_tokens ?? 0;
									const cacheReadInputTokens =
										usage.cache_read_input_tokens ?? 0;
									const outputTokens = usage.output_tokens ?? 0;
									const promptTokens =
										inputTokens +
										cacheCreationInputTokens +
										cacheReadInputTokens;
									const completionTokens = outputTokens;
									const totalTokens = promptTokens + completionTokens;

									// Extract cost from header if available
									const costHeader = response.headers.get(
										"anthropic-billing-cost",
									);
									const costUsd = costHeader
										? parseFloat(costHeader)
										: undefined;

									return {
										model: data.message.model,
										promptTokens,
										completionTokens,
										totalTokens,
										costUsd,
										inputTokens,
										cacheReadInputTokens,
										cacheCreationInputTokens,
										outputTokens,
									};
								}
							} catch {
								// Ignore parse errors
							}
						}
					}
				}

				// For streaming responses, we only extract initial usage
				// Output tokens will be accumulated during streaming but we can't capture that here
				return null;
			} else {
				// Handle non-streaming JSON responses
				const rawJson = await clone.json();
				const json = isRecord(rawJson)
					? {
							model:
								typeof rawJson.model === "string" ? rawJson.model : undefined,
							usage: parseAnthropicUsage(rawJson.usage),
						}
					: null;

				if (!json?.usage) return null;

				const inputTokens = json.usage.input_tokens ?? 0;
				const cacheCreationInputTokens =
					json.usage.cache_creation_input_tokens ?? 0;
				const cacheReadInputTokens = json.usage.cache_read_input_tokens ?? 0;
				const outputTokens = json.usage.output_tokens ?? 0;
				const promptTokens =
					inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
				const completionTokens = outputTokens;
				const totalTokens = promptTokens + completionTokens;

				// Extract cost from header if available
				const costHeader = response.headers.get("anthropic-billing-cost");
				const costUsd = costHeader ? parseFloat(costHeader) : undefined;

				return {
					model: json.model,
					promptTokens,
					completionTokens,
					totalTokens,
					costUsd,
					inputTokens,
					cacheReadInputTokens,
					cacheCreationInputTokens,
					outputTokens,
				};
			}
		} catch {
			// Ignore parsing errors
			return null;
		}
	}
}
