import { validateNumber } from "@ccflare/core";
import { errorResponse, NotFound } from "@ccflare/http";
import {
	createAccountAddHandler,
	createAccountPauseHandler,
	createAccountRemoveHandler,
	createAccountRenameHandler,
	createAccountResumeHandler,
	createAccountsListHandler,
	createAccountUpdateHandler,
} from "./handlers/accounts";
import { createAnalyticsHandler } from "./handlers/analytics";
import { createConfigHandlers } from "./handlers/config";
import { createHealthHandler } from "./handlers/health";
import { createLogsStreamHandler } from "./handlers/logs";
import { createLogsHistoryHandler } from "./handlers/logs-history";
import {
	createCleanupHandler,
	createCompactHandler,
} from "./handlers/maintenance";
import {
	createAuthCallbackHandler,
	createAuthCompleteHandler,
	createAuthInitHandler,
	createAuthSessionStatusHandler,
} from "./handlers/oauth";
import {
	createRequestsConversationHandler,
	createRequestsDetailHandler,
	createRequestsSummaryHandler,
} from "./handlers/requests";
import { createRequestsStreamHandler } from "./handlers/requests-stream";
import { createStatsHandler, createStatsResetHandler } from "./handlers/stats";
import type { APIContext } from "./types";

type RouteHandler = (
	req: Request,
	url: URL,
	params: Record<string, string>,
) => Response | Promise<Response>;

interface RouteEntry {
	method: string;
	pattern: RegExp;
	paramNames: string[];
	handler: RouteHandler;
}

/**
 * Build a regex from a route pattern like "/api/accounts/:id/pause".
 * Returns the regex and an ordered list of parameter names.
 */
function compilePattern(pattern: string): {
	regex: RegExp;
	paramNames: string[];
} {
	const paramNames: string[] = [];
	const regexStr = pattern.replace(/:([a-zA-Z]+)/g, (_match, name) => {
		paramNames.push(name);
		return "([^/]+)";
	});
	return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

/**
 * API Router that handles all API endpoints.
 * All routes (static and dynamic) are declared in one registration table.
 */
export class APIRouter {
	private context: APIContext;
	private staticHandlers: Map<
		string,
		(req: Request, url: URL) => Response | Promise<Response>
	>;
	private dynamicRoutes: RouteEntry[];

	constructor(context: APIContext) {
		this.context = context;
		this.staticHandlers = new Map();
		this.dynamicRoutes = [];
		this.registerHandlers();
	}

	private registerHandlers(): void {
		const { config, dbOps, getProviders, getRuntimeHealth } = this.context;

		// Create handlers (pre-instantiated, not created per-request)
		const healthHandler = createHealthHandler(
			dbOps,
			config,
			getProviders,
			getRuntimeHealth,
		);
		const statsHandler = createStatsHandler(dbOps);
		const statsResetHandler = createStatsResetHandler(dbOps);
		const accountsHandler = createAccountsListHandler(dbOps);
		const accountAddHandler = createAccountAddHandler(dbOps, config);
		const requestsSummaryHandler = createRequestsSummaryHandler(dbOps);
		const requestsDetailHandler = createRequestsDetailHandler(dbOps);
		const requestsConversationHandler =
			createRequestsConversationHandler(dbOps);
		const configHandlers = createConfigHandlers(config);
		const logsStreamHandler = createLogsStreamHandler();
		const logsHistoryHandler = createLogsHistoryHandler();
		const analyticsHandler = createAnalyticsHandler(this.context);
		const requestsStreamHandler = createRequestsStreamHandler();
		const cleanupHandler = createCleanupHandler(dbOps, config);
		const compactHandler = createCompactHandler(dbOps);

		// Pre-instantiate dynamic account handlers
		const accountPauseHandler = createAccountPauseHandler(dbOps);
		const accountResumeHandler = createAccountResumeHandler(dbOps);
		const accountRenameHandler = createAccountRenameHandler(dbOps);
		const accountUpdateHandler = createAccountUpdateHandler(dbOps);
		const accountRemoveHandler = createAccountRemoveHandler(dbOps);

		// Pre-instantiate auth handlers
		const authInitHandler = createAuthInitHandler(dbOps);
		const authCompleteHandler = createAuthCompleteHandler(dbOps);
		const authSessionStatusHandler = createAuthSessionStatusHandler(dbOps);
		const authCallbackHandler = createAuthCallbackHandler(dbOps);

		this.staticHandlers.set("GET:/health", () => healthHandler());
		this.staticHandlers.set("GET:/api/stats", () => statsHandler());
		this.staticHandlers.set("POST:/api/stats/reset", () => statsResetHandler());
		this.staticHandlers.set("GET:/api/accounts", () => accountsHandler());
		this.staticHandlers.set("POST:/api/accounts", (req) =>
			accountAddHandler(req),
		);
		this.staticHandlers.set("GET:/api/requests", (_req, url) => {
			const limitParam = url.searchParams.get("limit");
			const limit =
				validateNumber(limitParam || "50", "limit", {
					min: 1,
					max: 1000,
					integer: true,
				}) || 50;
			return requestsSummaryHandler(limit);
		});
		this.addDynamicRoute(
			"GET",
			"/api/requests/:requestId/detail",
			(_req, _url, params) => requestsDetailHandler(params.requestId),
		);
		this.addDynamicRoute(
			"GET",
			"/api/requests/:requestId/conversation",
			(_req, _url, params) => requestsConversationHandler(params.requestId),
		);
		this.staticHandlers.set("GET:/api/requests/stream", () =>
			requestsStreamHandler(),
		);
		this.staticHandlers.set("GET:/api/config", () =>
			configHandlers.getConfig(),
		);
		this.staticHandlers.set("GET:/api/config/strategy", () =>
			configHandlers.getStrategy(),
		);
		this.staticHandlers.set("POST:/api/config/strategy", (req) =>
			configHandlers.setStrategy(req),
		);
		this.staticHandlers.set("GET:/api/strategies", () =>
			configHandlers.getStrategies(),
		);
		this.staticHandlers.set("GET:/api/config/retention", () =>
			configHandlers.getRetention(),
		);
		this.staticHandlers.set("POST:/api/config/retention", (req) =>
			configHandlers.setRetention(req),
		);
		this.staticHandlers.set("POST:/api/maintenance/cleanup", () =>
			cleanupHandler(),
		);
		this.staticHandlers.set("POST:/api/maintenance/compact", () =>
			compactHandler(),
		);
		this.staticHandlers.set("GET:/api/logs/stream", () => logsStreamHandler());
		this.staticHandlers.set("GET:/api/logs/history", () =>
			logsHistoryHandler(),
		);
		this.staticHandlers.set("GET:/api/analytics", (_req, url) => {
			return analyticsHandler(url.searchParams);
		});

		this.addDynamicRoute(
			"POST",
			"/api/accounts/:accountId/pause",
			(req, _url, params) => accountPauseHandler(req, params.accountId),
		);
		this.addDynamicRoute(
			"POST",
			"/api/accounts/:accountId/resume",
			(req, _url, params) => accountResumeHandler(req, params.accountId),
		);
		this.addDynamicRoute(
			"POST",
			"/api/accounts/:accountId/rename",
			(req, _url, params) => accountRenameHandler(req, params.accountId),
		);
		this.addDynamicRoute(
			"PATCH",
			"/api/accounts/:accountId",
			(req, _url, params) => accountUpdateHandler(req, params.accountId),
		);
		this.addDynamicRoute(
			"DELETE",
			"/api/accounts/:accountId",
			(req, _url, params) => accountRemoveHandler(req, params.accountId),
		);

		// Auth session status
		this.addDynamicRoute(
			"GET",
			"/api/auth/session/:sessionId/status",
			(req, _url, params) => authSessionStatusHandler(req, params.sessionId),
		);

		// OAuth init and complete by provider
		this.addDynamicRoute(
			"POST",
			"/api/auth/:provider/init",
			(req, _url, params) => authInitHandler(req, params.provider),
		);
		this.addDynamicRoute(
			"POST",
			"/api/auth/:provider/complete",
			(req, _url, params) => authCompleteHandler(req, params.provider),
		);

		// OAuth browser callback
		this.addDynamicRoute(
			"GET",
			"/oauth/:provider/callback",
			(req, url, params) => authCallbackHandler(req, params.provider, url),
		);
	}

	private addDynamicRoute(
		method: string,
		pattern: string,
		handler: RouteHandler,
	): void {
		const { regex, paramNames } = compilePattern(pattern);
		this.dynamicRoutes.push({ method, pattern: regex, paramNames, handler });
	}

	/**
	 * Wrap a handler with error handling
	 */
	private wrapHandler(
		handler: (req: Request, url: URL) => Response | Promise<Response>,
	): (req: Request, url: URL) => Promise<Response> {
		return async (req: Request, url: URL) => {
			try {
				return await handler(req, url);
			} catch (error) {
				return errorResponse(error);
			}
		};
	}

	/**
	 * Wrap a dynamic handler with error handling
	 */
	private wrapDynamicHandler(
		handler: RouteHandler,
		params: Record<string, string>,
	): (req: Request, url: URL) => Promise<Response> {
		return async (req: Request, url: URL) => {
			try {
				return await handler(req, url, params);
			} catch (error) {
				return errorResponse(error);
			}
		};
	}

	/**
	 * Handle an incoming request
	 */
	async handleRequest(url: URL, req: Request): Promise<Response | null> {
		const path = url.pathname;
		const method = req.method;
		const key = `${method}:${path}`;

		// Check for exact match (static routes)
		const handler = this.staticHandlers.get(key);
		if (handler) {
			return await this.wrapHandler(handler)(req, url);
		}

		// Check dynamic routes
		for (const route of this.dynamicRoutes) {
			if (route.method !== method) {
				continue;
			}
			const match = path.match(route.pattern);
			if (match) {
				const params: Record<string, string> = {};
				for (let i = 0; i < route.paramNames.length; i++) {
					params[route.paramNames[i]] = match[i + 1];
				}
				return await this.wrapDynamicHandler(route.handler, params)(req, url);
			}
		}

		if (
			path === "/health" ||
			path.startsWith("/api/") ||
			path.startsWith("/oauth/")
		) {
			return errorResponse(NotFound(`No route for ${method} ${path}`));
		}

		// No matching route
		return null;
	}
}
