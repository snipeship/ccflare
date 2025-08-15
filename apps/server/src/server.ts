import { dirname } from "node:path";
import { Config, type RuntimeConfig } from "@ccflare/config";
import {
	CACHE,
	DEFAULT_STRATEGY,
	HTTP_STATUS,
	NETWORK,
	registerDisposable,
	setPricingLogger,
	shutdown,
	TIME_CONSTANTS,
} from "@ccflare/core";
import { container, SERVICE_KEYS } from "@ccflare/core-di";
// Import React dashboard assets
import dashboardManifest from "@ccflare/dashboard-web/dist/manifest.json";
import { AsyncDbWriter, DatabaseFactory } from "@ccflare/database";
import { APIRouter } from "@ccflare/http-api";
import { SessionStrategy } from "@ccflare/load-balancer";
import { Logger } from "@ccflare/logger";
import { getProvider } from "@ccflare/providers";
import {
	getUsageWorker,
	handleProxy,
	type ProxyContext,
	terminateUsageWorker,
} from "@ccflare/proxy";
import { serve } from "bun";

// Helper function to resolve dashboard assets with fallback
function resolveDashboardAsset(assetPath: string): string | null {
	try {
		// Try resolving as a package first
		return Bun.resolveSync(
			`@ccflare/dashboard-web/dist${assetPath}`,
			dirname(import.meta.path),
		);
	} catch {
		// Fallback to relative path within the repo (development / mono-repo usage)
		try {
			return Bun.resolveSync(
				`../../../packages/dashboard-web/dist${assetPath}`,
				dirname(import.meta.path),
			);
		} catch {
			return null;
		}
	}
}

// Helper function to serve dashboard files with proper headers
function serveDashboardFile(
	assetPath: string,
	contentType?: string,
	cacheControl?: string,
): Response {
	const fullPath = resolveDashboardAsset(assetPath);
	if (!fullPath) {
		return new Response("Not Found", { status: HTTP_STATUS.NOT_FOUND });
	}

	// Auto-detect content type if not provided
	if (!contentType) {
		if (assetPath.endsWith(".js")) contentType = "application/javascript";
		else if (assetPath.endsWith(".css")) contentType = "text/css";
		else if (assetPath.endsWith(".html")) contentType = "text/html";
		else if (assetPath.endsWith(".json")) contentType = "application/json";
		else if (assetPath.endsWith(".svg")) contentType = "image/svg+xml";
		else contentType = "text/plain";
	}

	return new Response(Bun.file(fullPath), {
		headers: {
			"Content-Type": contentType,
			"Cache-Control": cacheControl || CACHE.CACHE_CONTROL_NO_CACHE,
		},
	});
}

// Module-level server instance
let serverInstance: ReturnType<typeof serve> | null = null;

// Export for programmatic use
export default function startServer(options?: {
	port?: number;
	withDashboard?: boolean;
}) {
	// Return existing server if already running
	if (serverInstance) {
		return {
			port: serverInstance.port,
			stop: () => {
				if (serverInstance) {
					serverInstance.stop();
					serverInstance = null;
				}
			},
		};
	}

	const { port = NETWORK.DEFAULT_PORT, withDashboard = true } = options || {};

	// Initialize DI container
	container.registerInstance(SERVICE_KEYS.Config, new Config());
	container.registerInstance(SERVICE_KEYS.Logger, new Logger("Server"));

	// Initialize components
	const config = container.resolve<Config>(SERVICE_KEYS.Config);
	const runtime = config.getRuntime();
	// Override port if provided
	if (port !== runtime.port) {
		runtime.port = port;
	}
	DatabaseFactory.initialize(undefined, runtime);
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();
	const log = container.resolve<Logger>(SERVICE_KEYS.Logger);
	container.registerInstance(SERVICE_KEYS.Database, dbOps);

	// Initialize async DB writer
	const asyncWriter = new AsyncDbWriter();
	container.registerInstance(SERVICE_KEYS.AsyncWriter, asyncWriter);
	registerDisposable(asyncWriter);

	// Initialize pricing logger
	const pricingLogger = new Logger("Pricing");
	container.registerInstance(SERVICE_KEYS.PricingLogger, pricingLogger);
	setPricingLogger(pricingLogger);

	const apiRouter = new APIRouter({ db, config, dbOps });

	// Initialize load balancing strategy (will be created after runtime config)

	// Get the provider
	const provider = getProvider("anthropic");
	if (!provider) {
		throw new Error("Anthropic provider not available");
	}

	// Create runtime config
	const runtimeConfig: RuntimeConfig = {
		clientId: config.get(
			"client_id",
			"9d1c250a-e61b-44d9-88ed-5944d1962f5e",
		) as string,
		retry: {
			attempts: config.get("retry_attempts", 3) as number,
			delayMs: config.get("retry_delay_ms", 1000) as number,
			backoff: config.get("retry_backoff", 2) as number,
		},
		sessionDurationMs: config.get(
			"session_duration_ms",
			TIME_CONSTANTS.SESSION_DURATION_DEFAULT,
		) as number,
		port,
	};

	// Now create the strategy with runtime config
	const strategy = new SessionStrategy(runtimeConfig.sessionDurationMs);
	strategy.initialize(dbOps);

	// Proxy context
	const proxyContext: ProxyContext = {
		strategy,
		dbOps,
		runtime: runtimeConfig,
		provider,
		refreshInFlight: new Map(),
		asyncWriter,
		usageWorker: getUsageWorker(),
	};

	// Hot reload strategy configuration
	config.on("change", (changeType, fieldName) => {
		if (fieldName === "strategy") {
			log.info(`Strategy configuration changed: ${changeType}`);
			const newStrategyName = config.getStrategy();
			// For now, only SessionStrategy is supported
			if (newStrategyName === "session") {
				const strategy = new SessionStrategy(runtimeConfig.sessionDurationMs);
				strategy.initialize(dbOps);
				proxyContext.strategy = strategy;
			}
		}
	});

	// Main server
	serverInstance = serve({
		port: runtime.port,
		idleTimeout: NETWORK.IDLE_TIMEOUT_MAX, // Max allowed by Bun
		async fetch(req) {
			const url = new URL(req.url);

			// Try API routes first
			const apiResponse = await apiRouter.handleRequest(url, req);
			if (apiResponse) {
				return apiResponse;
			}

			// Check API key for auth protection
			const apiKey = process.env.API_KEY;

			// Dashboard routes (only if enabled)
			if (withDashboard) {
				// Dashboard routes with API key protection
				if (url.pathname === "/" || url.pathname === "/dashboard" ||
					(apiKey && url.pathname === `/${apiKey}/`)) {

					// If API key is required, only allow /{key}/ access
					if (apiKey && url.pathname !== `/${apiKey}/`) {
						return new Response("Not Found", { status: HTTP_STATUS.NOT_FOUND });
					}

					return serveDashboardFile("/index.html", "text/html");
				}

				// Serve dashboard static assets with auth protection
				let assetPathname = url.pathname;
				let isAuthenticatedAssetRequest = false;

				// If API key is set, check for auth-prefixed asset paths
				if (apiKey && url.pathname.startsWith(`/${apiKey}/`)) {
					// Strip the key prefix for asset lookup
					assetPathname = url.pathname.substring(`/${apiKey}`.length);
					isAuthenticatedAssetRequest = true;
				}

				if ((dashboardManifest as Record<string, string>)[assetPathname]) {
					// If API key is required but request is not authenticated, block access
					if (apiKey && !isAuthenticatedAssetRequest) {
						return new Response("Not Found", { status: HTTP_STATUS.NOT_FOUND });
					}

					return serveDashboardFile(
						assetPathname,
						undefined,
						CACHE.CACHE_CONTROL_STATIC,
					);
				}
			}

			// Handle API authentication and proxying
			if (apiKey) {
				// Auth required - check for /key/v1/ format
				const pathParts = url.pathname.split('/').filter(Boolean);
				if (pathParts[0] === apiKey && pathParts[1] === 'v1') {
					// Valid auth - rewrite path and proxy
					url.pathname = '/' + pathParts.slice(1).join('/');
					return handleProxy(req, url, proxyContext);
				}
				return new Response("Not Found", { status: HTTP_STATUS.NOT_FOUND });
			} else {
				// No auth required - allow direct /v1/ access
				if (!url.pathname.startsWith("/v1/")) {
					return new Response("Not Found", { status: HTTP_STATUS.NOT_FOUND });
				}
				return handleProxy(req, url, proxyContext);
			}
		},
	});

	// Log server startup
	console.log(`
🎯 ccflare Server v${process.env.npm_package_version || "1.0.0"}
🌐 Port: ${serverInstance.port}
📊 Dashboard: ${withDashboard ? `http://localhost:${serverInstance.port}` : "disabled"}
🔗 API Base: http://localhost:${serverInstance.port}/api

Available endpoints:
- POST   http://localhost:${serverInstance.port}/v1/*            → Proxy to Claude API
- GET    http://localhost:${serverInstance.port}/api/accounts    → List accounts
- POST   http://localhost:${serverInstance.port}/api/accounts    → Add account
- DELETE http://localhost:${serverInstance.port}/api/accounts/:id → Remove account
- GET    http://localhost:${serverInstance.port}/api/stats       → View statistics
- POST   http://localhost:${serverInstance.port}/api/stats/reset → Reset statistics
- GET    http://localhost:${serverInstance.port}/api/config      → View configuration
- PATCH  http://localhost:${serverInstance.port}/api/config      → Update configuration

⚡ Ready to proxy requests...
`);

	// Log configuration
	console.log(
		`⚙️  Current strategy: ${config.getStrategy()} (default: ${DEFAULT_STRATEGY})`,
	);

	// Log initial account status
	const accounts = dbOps.getAllAccounts();
	const activeAccounts = accounts.filter(
		(a) => !a.paused && (!a.expires_at || a.expires_at > Date.now()),
	);
	log.info(
		`Loaded ${accounts.length} accounts (${activeAccounts.length} active)`,
	);
	if (activeAccounts.length === 0) {
		log.warn(
			"No active accounts available - requests will be forwarded without authentication",
		);
	}

	return {
		port: serverInstance.port,
		stop: () => {
			if (serverInstance) {
				serverInstance.stop();
				serverInstance = null;
			}
		},
	};
}

// Graceful shutdown handler
async function handleGracefulShutdown(signal: string) {
	console.log(`\n👋 Received ${signal}, shutting down gracefully...`);
	try {
		terminateUsageWorker();
		await shutdown();
		console.log("✅ Shutdown complete");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
}

// Register signal handlers
process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

// Run server if this is the main entry point
if (import.meta.main) {
	startServer();
}
