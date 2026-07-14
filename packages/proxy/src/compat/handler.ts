import { requestEvents } from "@ccflare/core";
import { BadRequest, errorResponse, ServiceUnavailable } from "@ccflare/http";
import { Logger } from "@ccflare/logger";
import type { AccountProvider } from "@ccflare/types";
import {
	type ResolvedProxyContext,
	selectAccountsForRequest,
} from "../handlers";
import {
	createRequestMetadata,
	prepareRequestBody,
} from "../handlers/request-handler";
import { processProxyResponse } from "../handlers/response-processor";
import { getValidAccessToken } from "../handlers/token-manager";
import type { ProxyContext } from "../proxy";
import { forwardToClient } from "../response-handler";
import { type StrippedModel, stripCompatibilityModelPrefix } from "./model-id";
import { COMPAT_PROVIDER_ORDER, parseCompatibilityRoute } from "./route-parser";
import {
	applyClaudeCodeShaping,
	convertAnthropicRequestToOpenAIChat,
	convertAnthropicRequestToOpenAIResponses,
	convertOpenAIChatRequestToAnthropic,
	convertOpenAIChatRequestToOpenAIResponses,
	convertOpenAIResponsesRequestToAnthropic,
	normalizeCodexResponsesRequest,
} from "./transforms/requests";
import {
	transformAnthropicResponseToOpenAIChat,
	transformAnthropicResponseToOpenAIResponses,
	transformOpenAIChatResponseToAnthropic,
	transformOpenAIResponsesResponseToAnthropic,
	transformOpenAIResponsesResponseToOpenAIChat,
} from "./transforms/responses";
import type { CompatibilityRouteKind } from "./types";

const log = new Logger("CompatibilityProxy");

type CompatibilityExecutionPlan = {
	upstreamPath: string;
	providerName: AccountProvider;
	body: Record<string, unknown>;
	transformResponse: (response: Response) => Promise<Response>;
};

function buildCompatibilityError(status: 400 | 503, message: string): Response {
	return errorResponse(
		status === 400 ? BadRequest(message) : ServiceUnavailable(message),
	);
}

function buildResolvedContext(
	ctx: ProxyContext,
	providerName: AccountProvider,
	upstreamPath: string,
): ResolvedProxyContext {
	const provider = ctx.providerRegistry.getProvider(providerName);
	if (!provider) {
		throw new Error(`Provider '${providerName}' is not registered`);
	}

	return {
		...ctx,
		provider,
		providerName,
		upstreamPath,
	};
}

const ANTHROPIC_PROVIDERS = new Set<string>(["anthropic", "claude-code"]);
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA =
	"claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05,token-efficient-tools-2026-03-28";

function buildUpstreamHeaders(
	sourceHeaders: Headers,
	providerName: string,
	isStreaming: boolean,
): Headers {
	const headers = new Headers(sourceHeaders);
	headers.set("content-type", "application/json");
	headers.delete("content-length");
	headers.set("accept", isStreaming ? "text/event-stream" : "application/json");
	if (ANTHROPIC_PROVIDERS.has(providerName)) {
		headers.set("anthropic-version", ANTHROPIC_VERSION);
		headers.set("anthropic-beta", ANTHROPIC_BETA);
	}
	return headers;
}

async function fetchUpstream(
	req: Request,
	url: URL,
	account: Parameters<typeof getValidAccessToken>[0] | null,
	requestContext: ResolvedProxyContext,
	requestBody: string,
	isStreaming: boolean,
): Promise<Response> {
	const headers = requestContext.provider.prepareHeaders(
		buildUpstreamHeaders(req.headers, requestContext.providerName, isStreaming),
		account,
	);

	const query =
		requestContext.providerName === "claude-code" ? "?beta=true" : url.search;
	const targetUrl = requestContext.provider.buildUrl(
		requestContext.upstreamPath,
		query,
		account ?? undefined,
	);

	return fetch(targetUrl, {
		method: req.method,
		headers,
		body: requestBody,
	});
}

const identityTransform = async (response: Response) => response;

function normalizeResponsesBodyForProvider(
	provider: AccountProvider,
	body: Record<string, unknown>,
): Record<string, unknown> {
	return provider === "codex" ? normalizeCodexResponsesRequest(body) : body;
}

function buildExecutionPlan(
	route: CompatibilityRouteKind,
	actualProvider: AccountProvider,
	requestBody: Record<string, unknown>,
	stripped: StrippedModel,
): CompatibilityExecutionPlan {
	switch (route) {
		case "anthropic-messages": {
			if (actualProvider === "anthropic" || actualProvider === "claude-code") {
				return {
					upstreamPath: "/v1/messages",
					providerName: actualProvider,
					body: { ...requestBody, model: stripped.model },
					transformResponse: identityTransform,
				};
			}

			if (actualProvider === "openai") {
				return {
					upstreamPath: "/chat/completions",
					providerName: actualProvider,
					body: convertAnthropicRequestToOpenAIChat(
						requestBody,
						stripped.model,
					),
					transformResponse: transformOpenAIChatResponseToAnthropic,
				};
			}

			return {
				upstreamPath: "/responses",
				providerName: actualProvider,
				body: normalizeResponsesBodyForProvider(
					actualProvider,
					convertAnthropicRequestToOpenAIResponses(requestBody, stripped.model),
				),
				transformResponse: transformOpenAIResponsesResponseToAnthropic,
			};
		}
		case "openai-chat-completions": {
			if (actualProvider === "openai") {
				return {
					upstreamPath: "/chat/completions",
					providerName: actualProvider,
					body: { ...requestBody, model: stripped.model },
					transformResponse: identityTransform,
				};
			}
			if (actualProvider === "codex") {
				return {
					upstreamPath: "/responses",
					providerName: actualProvider,
					body: normalizeResponsesBodyForProvider(
						actualProvider,
						convertOpenAIChatRequestToOpenAIResponses(
							requestBody,
							stripped.model,
						),
					),
					transformResponse: transformOpenAIResponsesResponseToOpenAIChat,
				};
			}
			return {
				upstreamPath: "/v1/messages",
				providerName: actualProvider,
				body: convertOpenAIChatRequestToAnthropic(requestBody, stripped.model),
				transformResponse: transformAnthropicResponseToOpenAIChat,
			};
		}
		case "openai-responses": {
			if (actualProvider === "openai" || actualProvider === "codex") {
				return {
					upstreamPath: "/responses",
					providerName: actualProvider,
					body: normalizeResponsesBodyForProvider(actualProvider, {
						...requestBody,
						model: stripped.model,
					}),
					transformResponse: identityTransform,
				};
			}
			return {
				upstreamPath: "/v1/messages",
				providerName: actualProvider,
				body: convertOpenAIResponsesRequestToAnthropic(
					requestBody,
					stripped.model,
				),
				transformResponse: (response) =>
					transformAnthropicResponseToOpenAIResponses(response, requestBody),
			};
		}
	}
}

type TryProviderFamilyOptions = {
	req: Request;
	url: URL;
	requestMeta: ReturnType<typeof createRequestMetadata>;
	requestBodyBuffer: ArrayBuffer;
	requestBodyJson: Record<string, unknown>;
	ctx: ProxyContext;
	actualProvider: AccountProvider;
	route: CompatibilityRouteKind;
	stripped: StrippedModel;
};

async function tryProviderFamily(
	options: TryProviderFamilyOptions,
): Promise<Response | null> {
	const {
		req,
		url,
		requestMeta,
		requestBodyBuffer,
		requestBodyJson,
		ctx,
		actualProvider,
		route,
		stripped,
	} = options;
	const plan = buildExecutionPlan(
		route,
		actualProvider,
		requestBodyJson,
		stripped,
	);
	const requestContext = buildResolvedContext(
		ctx,
		plan.providerName,
		plan.upstreamPath,
	);
	const accounts = selectAccountsForRequest(requestMeta, requestContext);

	if (accounts.length === 0) {
		return null;
	}

	let lastErrorResponse: Response | null = null;
	for (let attempt = 0; attempt < accounts.length; attempt += 1) {
		const account = accounts[attempt];
		try {
			const accessToken = await getValidAccessToken(account, requestContext);
			const requestAccount =
				accessToken === account.access_token
					? account
					: { ...account, access_token: accessToken };
			const upstreamBody =
				plan.providerName === "claude-code"
					? applyClaudeCodeShaping(plan.body)
					: plan.body;

			const upstreamRequestStartedAt = Date.now();
			const isStreaming = upstreamBody.stream === true;
			const response = await fetchUpstream(
				req,
				url,
				requestAccount,
				requestContext,
				JSON.stringify(upstreamBody),
				isStreaming,
			);
			const responseHeadersReceivedAt = Date.now();

			log.info(
				`Upstream ${actualProvider}/${account.name}: ${response.status} ${response.headers.get("content-type")}`,
			);

			if (processProxyResponse(response, account, requestContext)) {
				// Drain the body to free the connection and avoid memory leaks
				// when failover retries with another account
				try {
					await response.body?.cancel();
				} catch {
					// Ignore drain errors
				}
				continue;
			}

			if (!response.ok) {
				const errorBody = await response.text();
				log.warn(
					`Upstream ${actualProvider}/${account.name} returned ${response.status}: ${errorBody.slice(0, 500)}`,
				);
				lastErrorResponse = new Response(errorBody, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
				continue;
			}

			const transformedResponse = await plan.transformResponse(response);
			return await forwardToClient(
				{
					requestId: requestMeta.id,
					method: requestMeta.method,
					path: url.pathname,
					account,
					requestHeaders: req.headers,
					requestBody: requestBodyBuffer,
					response: transformedResponse,
					timestamp: requestMeta.timestamp,
					upstreamRequestStartedAt,
					responseHeadersReceivedAt,
					retryAttempt: 0,
					failoverAttempts: attempt,
					preExtractedModel: stripped.model,
				},
				requestContext,
			);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			log.error(
				`Compatibility request failed for ${actualProvider}/${account.name}: ${detail}`,
			);
		}
	}

	return lastErrorResponse;
}

export async function handleCompatibilityProxy(
	req: Request,
	url: URL,
	ctx: ProxyContext,
): Promise<Response | null> {
	const route = parseCompatibilityRoute(url.pathname);
	if (!route) {
		return null;
	}

	if (req.method !== "POST") {
		return buildCompatibilityError(
			400,
			"Compatibility routes only support POST",
		);
	}

	const { buffer: requestBodyBuffer } = await prepareRequestBody(req);
	if (!requestBodyBuffer) {
		return buildCompatibilityError(
			400,
			"Compatibility routes require a JSON body",
		);
	}

	let requestBodyJson: Record<string, unknown>;
	try {
		requestBodyJson = JSON.parse(
			new TextDecoder().decode(requestBodyBuffer),
		) as Record<string, unknown>;
	} catch {
		return buildCompatibilityError(
			400,
			"Compatibility routes require valid JSON",
		);
	}

	const model = stripCompatibilityModelPrefix(requestBodyJson.model);
	if (!model) {
		return buildCompatibilityError(
			400,
			"Compatibility routes require model values like 'openai/<model-id>' or 'anthropic/<model-id>'",
		);
	}

	const requestMeta = createRequestMetadata(req, url);
	requestEvents.emit("event", {
		type: "ingress",
		id: requestMeta.id,
		timestamp: requestMeta.timestamp,
		method: requestMeta.method,
		path: requestMeta.path,
	});
	for (const actualProvider of COMPAT_PROVIDER_ORDER[model.family]) {
		const response = await tryProviderFamily({
			req,
			url,
			requestMeta,
			requestBodyBuffer,
			requestBodyJson,
			ctx,
			actualProvider,
			route: route.kind,
			stripped: model,
		});
		if (response) {
			return response;
		}
	}

	return buildCompatibilityError(
		503,
		`No usable accounts available for the '${model.family}' compatibility family`,
	);
}
