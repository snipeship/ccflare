import crypto from "node:crypto";
import type { DatabaseOperations } from "@ccflare/database";

// Session storage (in production, use a proper session store)
const sessions = new Map<string, { username: string; expires: number }>();

// Generate a secure session token
function generateSessionToken(): string {
	return crypto.randomBytes(32).toString("hex");
}

// Clean expired sessions
function cleanExpiredSessions() {
	const now = Date.now();
	for (const [token, session] of sessions.entries()) {
		if (session.expires < now) {
			sessions.delete(token);
		}
	}
}

// Verify session
function verifySession(token: string | null): boolean {
	if (!token) return false;
	cleanExpiredSessions();
	const session = sessions.get(token);
	return session ? session.expires > Date.now() : false;
}

// Get session token from request
function getSessionToken(req: Request): string | null {
	const cookie = req.headers.get("cookie");
	if (!cookie) return null;

	const match = cookie.match(/session=([^;]+)/);
	return match ? match[1] : null;
}

export const createLoginHandler = (db: DatabaseOperations) => {
	return async (req: Request): Promise<Response> => {
		const body = (await req.json()) as { username: string; password: string };
		const { username, password } = body;

		// Validate credentials against database
		const isValid = db.authenticateUser(username, password);

		if (!isValid) {
			return new Response(JSON.stringify({ error: "Invalid credentials" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Create session
		const token = generateSessionToken();
		const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
		sessions.set(token, { username, expires });

		// Set session cookie
		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
			},
		});
	};
};

export const createLogoutHandler = () => {
	return async (req: Request): Promise<Response> => {
		const token = getSessionToken(req);
		if (token) {
			sessions.delete(token);
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
			},
		});
	};
};

export const createAuthCheckHandler = () => {
	return async (req: Request): Promise<Response> => {
		// Check if auth is enabled via environment variable
		const authEnabled = process.env.AUTH_ENABLED === 'true';
		
		// If auth is disabled, always return authenticated: true with authEnabled: false
		if (!authEnabled) {
			return new Response(JSON.stringify({ authenticated: true, authEnabled: false }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		
		const token = getSessionToken(req);
		const isValid = verifySession(token);

		if (!isValid) {
			return new Response(JSON.stringify({ authenticated: false, authEnabled: true }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ authenticated: true, authEnabled: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};
};

// Middleware to check authentication for API routes
export function requireAuth(
	handler: (req: Request, url: URL) => Response | Promise<Response>,
) {
	return async (req: Request, url: URL): Promise<Response> => {
		// Check if auth is enabled via environment variable
		const authEnabled = process.env.AUTH_ENABLED === 'true';
		
		// Skip auth check if disabled
		if (!authEnabled) {
			return handler(req, url);
		}
		
		const token = getSessionToken(req);
		if (!verifySession(token)) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		return handler(req, url);
	};
}
