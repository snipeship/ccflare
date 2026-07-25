import { Config } from "@ccflare/config";
import { patterns, ValidationError, validateString } from "@ccflare/core";
import type { DatabaseOperations } from "@ccflare/database";
import {
	BadRequest,
	errorResponse,
	InternalServerError,
	jsonResponse,
	NotFound,
} from "@ccflare/http";
import { Logger } from "@ccflare/logger";
import {
	createOAuthFlow,
	isOAuthFlowProvider,
	type OAuthFlowProvider,
} from "@ccflare/oauth-flow";

import {
	type AuthCompleteData,
	type AuthInitData,
	isAccountProvider,
	isDeviceCodeProvider,
	type MutationResult,
} from "@ccflare/types";
import { parseJsonObject } from "../utils/json";

const log = new Logger("OAuthHandler");
const CALLBACK_FORWARDER_TIMEOUT_MS = 5 * 60 * 1000;

const CALLBACK_FORWARDER_CONFIG: Partial<
	Record<
		OAuthFlowProvider,
		{
			port: number;
			targetPath: string;
		}
	>
> = {
	codex: {
		port: 1455,
		targetPath: "/oauth/codex/callback",
	},
};

type CallbackForwarder = {
	provider: OAuthFlowProvider;
	server: ReturnType<typeof Bun.serve>;
	timeout: ReturnType<typeof setTimeout>;
};

const callbackForwarders = new Map<number, CallbackForwarder>();

function resolveAuthProvider(provider: string): OAuthFlowProvider | Response {
	if (!isAccountProvider(provider)) {
		return errorResponse(NotFound(`Unknown provider '${provider}'`));
	}

	if (!isOAuthFlowProvider(provider)) {
		return errorResponse(
			BadRequest(`Provider '${provider}' does not support auth flows`),
		);
	}

	return provider;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function htmlPage(status: number, title: string, body: string): Response {
	return new Response(
		`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${escapeHtml(title)}</title>
	</head>
	<body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5;">
		<h1>${escapeHtml(title)}</h1>
		<p>${body}</p>
	</body>
</html>`,
		{
			status,
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			},
		},
	);
}

function parseSessionStatus(stateJson: string): "pending" | "completed" {
	try {
		const parsed = JSON.parse(stateJson);
		return typeof parsed === "object" &&
			parsed !== null &&
			"status" in parsed &&
			parsed.status === "completed"
			? "completed"
			: "pending";
	} catch {
		return "pending";
	}
}

function stopCallbackForwarder(port: number): void {
	const forwarder = callbackForwarders.get(port);
	if (!forwarder) {
		return;
	}

	clearTimeout(forwarder.timeout);
	forwarder.server.stop(true);
	callbackForwarders.delete(port);
}

export function stopAllOAuthCallbackForwarders(): void {
	for (const port of [...callbackForwarders.keys()]) {
		stopCallbackForwarder(port);
	}
}

function startCallbackForwarder(provider: OAuthFlowProvider): void {
	const config = CALLBACK_FORWARDER_CONFIG[provider];
	if (!config) {
		return;
	}

	const { port, targetPath } = config;
	stopCallbackForwarder(port);

	const timeout = setTimeout(() => {
		stopCallbackForwarder(port);
	}, CALLBACK_FORWARDER_TIMEOUT_MS);
	timeout.unref?.();

	try {
		const server = Bun.serve({
			port,
			fetch(request) {
				const url = new URL(request.url);
				if (request.method !== "GET" || url.pathname !== "/auth/callback") {
					return new Response("Not Found", { status: 404 });
				}

				const target = new URL(`http://localhost:8080${targetPath}`);
				target.search = url.search;
				setTimeout(() => {
					stopCallbackForwarder(port);
				}, 0);

				return new Response(null, {
					status: 302,
					headers: {
						Location: target.toString(),
						"Cache-Control": "no-store",
					},
				});
			},
		});

		callbackForwarders.set(port, {
			provider,
			server,
			timeout,
		});
	} catch (error) {
		clearTimeout(timeout);
		throw error;
	}
}

/**
 * Create an OAuth initialization handler
 */
export function createAuthInitHandler(dbOps: DatabaseOperations) {
	return async (req: Request, provider: string): Promise<Response> => {
		try {
			const validatedProvider = resolveAuthProvider(provider);
			if (validatedProvider instanceof Response) {
				return validatedProvider;
			}

			const body = await parseJsonObject(req);

			// Validate account name
			const name = validateString(body.name, "name", {
				required: true,
				minLength: 1,
				maxLength: 100,
				pattern: patterns.accountName,
			});
			if (!name) {
				return errorResponse(BadRequest("Valid account name is required"));
			}

			const config = new Config();
			const oauthFlow = await createOAuthFlow(dbOps, config);

			try {
				const flowResult = await oauthFlow.begin({
					name,
					provider: validatedProvider,
				});

				try {
					startCallbackForwarder(validatedProvider);
				} catch (error) {
					dbOps.deleteAuthSession(flowResult.sessionId);
					throw error;
				}

				const result: MutationResult<AuthInitData> = {
					success: true,
					message: `OAuth flow initiated for '${name}'`,
					data: {
						authUrl: flowResult.authUrl,
						sessionId: flowResult.sessionId,
						provider: validatedProvider,
					},
				};
				return jsonResponse(result);
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("already exists")
				) {
					return errorResponse(BadRequest(error.message));
				}
				return errorResponse(InternalServerError((error as Error).message));
			}
		} catch (error) {
			if (error instanceof ValidationError) {
				return errorResponse(BadRequest(error.message));
			}
			log.error("OAuth init error:", error);
			return errorResponse(
				error instanceof Error
					? error
					: new Error("Failed to initialize OAuth"),
			);
		}
	};
}

/**
 * Create an OAuth callback handler
 */
export function createAuthCompleteHandler(dbOps: DatabaseOperations) {
	return async (req: Request, provider: string): Promise<Response> => {
		try {
			const validatedProvider = resolveAuthProvider(provider);
			if (validatedProvider instanceof Response) {
				return validatedProvider;
			}

			const body = await parseJsonObject(req);

			// Validate session ID
			const sessionId = validateString(body.sessionId, "sessionId", {
				required: true,
				pattern: patterns.uuid,
			});
			if (!sessionId) {
				return errorResponse(BadRequest("Session ID is required"));
			}

			// Device-grant providers never produce a code for the user to send;
			// completion polls the token endpoint with the stored device code.
			const deviceGrant = isDeviceCodeProvider(validatedProvider);
			const code = deviceGrant
				? ""
				: validateString(body.code, "code", {
						required: true,
						minLength: 1,
					});
			if (!deviceGrant && !code) {
				return errorResponse(BadRequest("Authorization code is required"));
			}

			const authSession = dbOps.getAuthSession(sessionId);
			if (!authSession || authSession.provider !== validatedProvider) {
				return errorResponse(
					BadRequest("OAuth session expired or invalid. Please try again."),
				);
			}
			const name = authSession.accountName;

			try {
				// Create OAuth flow instance
				const config = new Config();
				const oauthFlow = await createOAuthFlow(dbOps, config);

				// Device grants poll the token endpoint until the user approves in
				// the browser, which routinely outlasts an HTTP request. Run it in
				// the background and let the caller watch the auth session status;
				// drop the session on failure so the status flips off "pending".
				if (deviceGrant) {
					void oauthFlow
						.complete({ sessionId, code: "", name })
						.catch((error: unknown) => {
							log.error(`Device authorization failed for '${name}':`, error);
							dbOps.deleteAuthSession(sessionId);
						});

					const pending: MutationResult<AuthCompleteData> = {
						success: true,
						message: `Waiting for '${name}' to be approved in the browser`,
						data: { provider: validatedProvider },
					};
					return jsonResponse(pending);
				}

				await oauthFlow.complete({
					sessionId,
					code: code ?? "",
					name,
				});

				const result: MutationResult<AuthCompleteData> = {
					success: true,
					message: `Account '${name}' added successfully`,
					data: { provider: validatedProvider },
				};
				return jsonResponse(result);
			} catch (error) {
				return errorResponse(
					error instanceof Error
						? error
						: new Error("Failed to complete OAuth flow"),
				);
			}
		} catch (error) {
			if (error instanceof ValidationError) {
				return errorResponse(BadRequest(error.message));
			}
			log.error("OAuth callback error:", error);
			return errorResponse(
				error instanceof Error
					? error
					: new Error("Failed to process OAuth callback"),
			);
		}
	};
}

export function createAuthSessionStatusHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, sessionId: string): Promise<Response> => {
		const authSession = dbOps.getAuthSession(sessionId);
		if (!authSession) {
			return jsonResponse({ status: "expired" });
		}

		return jsonResponse({
			status: parseSessionStatus(authSession.stateJson),
		});
	};
}

export function createAuthCallbackHandler(dbOps: DatabaseOperations) {
	return async (
		_req: Request,
		provider: string,
		url: URL,
	): Promise<Response> => {
		if (!isAccountProvider(provider) || !isOAuthFlowProvider(provider)) {
			return htmlPage(
				404,
				"Authorization failed",
				"Unknown OAuth provider callback.",
			);
		}

		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		const providerError =
			url.searchParams.get("error_description") ??
			url.searchParams.get("error");

		if (providerError) {
			if (state) {
				const session = dbOps.getAuthSessionByState(state);
				if (session) {
					dbOps.deleteAuthSession(session.id);
				}
			}
			return htmlPage(400, "Authorization failed", escapeHtml(providerError));
		}

		if (!code || !state) {
			if (state) {
				const session = dbOps.getAuthSessionByState(state);
				if (session) {
					dbOps.deleteAuthSession(session.id);
				}
			}
			return htmlPage(
				400,
				"Authorization failed",
				"Missing required OAuth callback parameters.",
			);
		}

		const authSession = dbOps.getAuthSessionByState(state);
		if (!authSession || authSession.provider !== provider) {
			return htmlPage(
				400,
				"Authorization failed",
				"OAuth session expired or invalid. Please try again.",
			);
		}

		try {
			const config = new Config();
			const oauthFlow = await createOAuthFlow(dbOps, config);
			await oauthFlow.complete({
				sessionId: authSession.id,
				code,
			});

			return htmlPage(
				200,
				"Account connected",
				"Your OAuth account has been connected successfully. You can close this window and return to ccflare.",
			);
		} catch (error) {
			dbOps.deleteAuthSession(authSession.id);
			return htmlPage(
				400,
				"Authorization failed",
				escapeHtml(
					error instanceof Error
						? error.message
						: "Failed to complete OAuth flow.",
				),
			);
		}
	};
}
