// Error type constants
export const ERROR_TYPES = {
	NETWORK: "network",
	AUTH: "auth",
	RATE_LIMIT: "rate-limit",
	VALIDATION: "validation",
	SERVER: "server",
	UNKNOWN: "unknown",
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

// HTTP error class for API responses
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "HttpError";
	}
}

// Common HTTP error factories
export const BadRequest = (message: string, details?: unknown) =>
	new HttpError(400, message, details);

export const NotFound = (message: string, details?: unknown) =>
	new HttpError(404, message, details);

export const Conflict = (message: string, details?: unknown) =>
	new HttpError(409, message, details);

export const InternalServerError = (message: string, details?: unknown) =>
	new HttpError(500, message, details);

export const ServiceUnavailable = (message: string, details?: unknown) =>
	new HttpError(503, message, details);

// Error type detection
export function getErrorType(error: unknown): ErrorType {
	if (error instanceof HttpError) {
		if (error.status === 401) return ERROR_TYPES.AUTH;
		if (error.status === 429) return ERROR_TYPES.RATE_LIMIT;
		if (error.status >= 400 && error.status < 500)
			return ERROR_TYPES.VALIDATION;
		if (error.status >= 500) return ERROR_TYPES.SERVER;
	}

	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// Check for specific error types in message
		if (
			message.includes("network") ||
			message.includes("fetch failed") ||
			message.includes("failed to fetch") ||
			message.includes("connection") ||
			message.includes("econnrefused")
		) {
			return ERROR_TYPES.NETWORK;
		}

		if (
			message.includes("unauthorized") ||
			message.includes("authentication") ||
			message.includes("401") ||
			message.includes("token")
		) {
			return ERROR_TYPES.AUTH;
		}

		if (
			message.includes("rate limit") ||
			message.includes("too many requests") ||
			message.includes("429")
		) {
			return ERROR_TYPES.RATE_LIMIT;
		}

		if (
			message.includes("validation") ||
			message.includes("invalid") ||
			message.includes("bad request")
		) {
			return ERROR_TYPES.VALIDATION;
		}

		if (
			message.includes("server error") ||
			message.includes("500") ||
			message.includes("502") ||
			message.includes("503") ||
			message.includes("504")
		) {
			return ERROR_TYPES.SERVER;
		}
	}

	return ERROR_TYPES.UNKNOWN;
}

// Error type checkers
export const isNetworkError = (error: unknown): boolean =>
	getErrorType(error) === ERROR_TYPES.NETWORK;

export const isAuthError = (error: unknown): boolean =>
	getErrorType(error) === ERROR_TYPES.AUTH;

export const isRateLimitError = (error: unknown): boolean =>
	getErrorType(error) === ERROR_TYPES.RATE_LIMIT;

// Default error messages
const DEFAULT_ERROR_MESSAGES: Record<ErrorType, string> = {
	[ERROR_TYPES.NETWORK]:
		"Network error. Please check your connection and try again.",
	[ERROR_TYPES.AUTH]: "Authentication failed. Please sign in again.",
	[ERROR_TYPES.RATE_LIMIT]: "Too many requests. Please try again later.",
	[ERROR_TYPES.VALIDATION]: "Invalid request. Please check your input.",
	[ERROR_TYPES.SERVER]: "Server error. Please try again later.",
	[ERROR_TYPES.UNKNOWN]: "An unexpected error occurred.",
};

// Error formatting options
export interface ErrorFormatterOptions {
	defaultMessage?: string;
	errorMap?: Record<string, string>;
	includeDetails?: boolean;
}

// Format error for user display
export function formatError(
	error: unknown,
	options: ErrorFormatterOptions = {},
): string {
	const {
		defaultMessage = DEFAULT_ERROR_MESSAGES[ERROR_TYPES.UNKNOWN],
		errorMap = {},
		includeDetails = false,
	} = options;

	// Handle null/undefined
	if (error == null) {
		return defaultMessage;
	}

	// Handle Error instances
	if (error instanceof Error) {
		const message = error.message;

		// Check error map for custom messages
		for (const [key, value] of Object.entries(errorMap)) {
			if (message.includes(key)) {
				return value;
			}
		}

		// Get error type and use default message if appropriate
		const errorType = getErrorType(error);
		const defaultTypeMessage = DEFAULT_ERROR_MESSAGES[errorType];

		// For known error types, prefer the default message unless includeDetails is true
		if (errorType !== ERROR_TYPES.UNKNOWN && !includeDetails) {
			return defaultTypeMessage;
		}

		// Return the actual error message
		return message;
	}

	// Handle string errors
	if (typeof error === "string") {
		return error;
	}

	// Handle objects with message property
	if (typeof error === "object" && error !== null && "message" in error) {
		return String(error.message);
	}

	// Fallback
	return defaultMessage;
}

// Parse HTTP response error
export async function parseHttpError(response: Response): Promise<HttpError> {
	let message = `HTTP ${response.status}: ${response.statusText}`;
	let details: unknown;

	try {
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			const data = await response.json();
			if (data.error) {
				message =
					typeof data.error === "string"
						? data.error
						: data.error.message || message;
				details = data.error;
			} else if (data.message) {
				message = data.message;
				details = data;
			}
		} else {
			const text = await response.text();
			if (text) {
				message = text;
			}
		}
	} catch {
		// Ignore parsing errors
	}

	return new HttpError(response.status, message, details);
}
