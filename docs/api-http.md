# ccflare HTTP API Documentation

## Quick Start

```bash
# Check health status
curl http://localhost:8080/health

# Proxy a request to Anthropic
curl -X POST http://localhost:8080/v1/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# Proxy a request to OpenAI
curl -X POST http://localhost:8080/v1/openai/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# List all accounts
curl http://localhost:8080/api/accounts

# View dashboard
open http://localhost:8080
```

## Overview

ccflare provides a RESTful HTTP API for managing accounts, monitoring usage, and proxying requests to Anthropic and OpenAI. The API runs on port 8080 by default and requires no authentication.

### Base URL

```
http://localhost:8080
```

### Content Type

All API responses are in JSON format with `Content-Type: application/json`.

## Endpoints

### Health Check

#### GET /health

Check the health status of the ccflare service.

**Response:**
```json
{
  "status": "ok",
  "accounts": 5,
  "timestamp": "2024-12-17T10:30:45.123Z",
  "strategy": "session",
  "providers": ["anthropic", "openai"]
}
```

**Example:**
```bash
curl http://localhost:8080/health
```

---

### Provider Proxy

#### /v1/{provider}/* (All Methods)

Proxy requests to upstream provider APIs. The `/v1/{provider}` prefix is stripped exactly once before forwarding upstream. Requests are routed using the configured load balancing strategy across accounts matching the target provider.

**Supported Providers:**
- `/v1/anthropic/*` → `https://api.anthropic.com/*`
- `/v1/openai/*` → `https://api.openai.com/v1/*`

**Headers:**
- All standard provider API headers are supported
- `Authorization` header is managed by ccflare (no need to provide)

**Request Body:**
Same as the upstream provider API requirements for the specific endpoint.

**Response:**
Proxied response from the upstream provider API, including streaming responses.

**Automatic Failover:**
If a request fails or an account is rate limited, ccflare automatically retries with the next available account according to the configured load balancing strategy. This ensures high availability and reliability.

**Examples:**
```bash
# Anthropic
curl -X POST http://localhost:8080/v1/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# OpenAI chat completions
curl -X POST http://localhost:8080/v1/openai/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# OpenAI responses
curl -X POST http://localhost:8080/v1/openai/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "Hello!"
  }'
```

---

### ccflare Compatibility Proxy

#### POST /v1/ccflare/anthropic/messages
#### POST /v1/ccflare/openai/chat/completions
#### POST /v1/ccflare/openai/responses

Compatibility routes keep the client-facing Anthropic/OpenAI schema while routing
through a connected provider family chosen from the `model` prefix.

**Model Prefix Rules:**
- `openai/<model-id>` → prefers `codex`, then `openai`
- `anthropic/<model-id>` → prefers `claude-code`, then `anthropic`

Bare model names are rejected with `400`.

**Examples:**
```bash
# Ask for an Anthropic model through the OpenAI chat schema
curl -X POST http://localhost:8080/v1/ccflare/openai/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Ask for an OpenAI model through the Anthropic Messages schema
curl -X POST http://localhost:8080/v1/ccflare/anthropic/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Behavior:**
- HTTP only; websocket upgrades are not supported on `/v1/ccflare/*`
- requests use the same load-balancing and failover logic as native provider routes
- responses are translated back into the requested client schema, including SSE streams
- if no usable accounts exist in the requested family, ccflare returns `503`

---

### Account Management

#### GET /api/accounts

List all configured accounts with their current status.

**Response:**
```json
[
  {
    "id": "uuid-here",
    "name": "account1",
    "provider": "anthropic",
    "auth_method": "api_key",
    "base_url": null,
    "requestCount": 150,
    "totalRequests": 1500,
    "lastUsed": "2024-12-17T10:25:30.123Z",
    "created": "2024-12-01T08:00:00.000Z",
    "weight": 1,
    "paused": false,
    "tokenStatus": "valid",
    "tokenExpiresAt": null,
    "rateLimitStatus": {
      "code": "ok",
      "isLimited": false,
      "until": null
    },
    "rateLimitReset": "2024-12-17T10:30:00.000Z",
    "rateLimitRemaining": 100,
    "sessionInfo": {
      "active": true,
      "startedAt": "2024-12-17T10:00:00.000Z",
      "requestCount": 25
    }
  }
]
```

**Example:**
```bash
curl http://localhost:8080/api/accounts
```

---

### Auth Flow

OAuth and auth endpoints are provider-scoped. The `{provider}` path segment determines which provider's OAuth flow is used (e.g., `anthropic`, `openai`, `claude-code`, `codex`).

#### POST /api/auth/{provider}/init

Initialize an OAuth flow for adding a new account.

**Request:**
```json
{
  "name": "myaccount"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OAuth flow initiated for 'myaccount'",
  "data": {
    "authUrl": "https://claude.ai/oauth/authorize?...",
    "sessionId": "uuid-here",
    "provider": "claude-code"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/auth/claude-code/init \
  -H "Content-Type: application/json" \
  -d '{"name": "myaccount"}'
```

#### POST /api/auth/{provider}/complete

Complete the OAuth flow after user authorization.

**Request:**
```json
{
  "sessionId": "uuid-from-init-response",
  "code": "authorization-code-from-oauth"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account 'myaccount' added successfully!",
  "data": {
    "provider": "claude-code"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/auth/claude-code/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "uuid-here", "code": "auth-code"}'
```

#### GET /api/auth/session/{sessionId}/status

Check the status of an in-progress OAuth session.

**Example:**
```bash
curl http://localhost:8080/api/auth/session/uuid-here/status
```

#### GET /oauth/{provider}/callback

Browser redirect target for the OAuth flow. This is the callback URL that the OAuth provider redirects to after the user authorizes. Not called directly by API consumers.

---

### Account Management

#### DELETE /api/accounts/:accountId

Remove an account.

**Response:**
```json
{
  "success": true,
  "message": "Account 'account-name' removed successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8080/api/accounts/uuid-here
```

#### PATCH /api/accounts/:accountId

Update an account (e.g., rename or change `base_url`).

**Request:**
```json
{
  "name": "new-name",
  "base_url": "https://custom-endpoint.example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account updated"
}
```

**Example:**
```bash
curl -X PATCH http://localhost:8080/api/accounts/uuid-here \
  -H "Content-Type: application/json" \
  -d '{"name": "new-name"}'
```

#### POST /api/accounts/:accountId/rename

Rename an account.

**Request:**
```json
{
  "name": "new-name"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/accounts/uuid-here/rename \
  -H "Content-Type: application/json" \
  -d '{"name": "new-name"}'
```

#### POST /api/accounts/:accountId/pause

Pause an account temporarily.

**Response:**
```json
{
  "success": true,
  "message": "Account 'myaccount' paused"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/accounts/uuid-here/pause
```

#### POST /api/accounts/:accountId/resume

Resume a paused account.

**Response:**
```json
{
  "success": true,
  "message": "Account 'myaccount' resumed"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/accounts/uuid-here/resume
```

---

### Statistics

#### GET /api/stats

Get overall usage statistics.

**Response:**
```json
{
  "totalRequests": 5000,
  "successRate": 98.5,
  "activeAccounts": 4,
  "avgResponseTime": 1250.5,
  "totalTokens": 1500000,
  "totalCostUsd": 125.50,
  "avgTokensPerSecond": null,
  "topModels": [
    {"model": "claude-3-opus-20240229", "count": 3000},
    {"model": "claude-3-sonnet-20240229", "count": 2000}
  ]
}
```

**Example:**
```bash
curl http://localhost:8080/api/stats
```

#### POST /api/stats/reset

Reset all usage statistics.

**Response:**
```json
{
  "success": true,
  "message": "Statistics reset successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/stats/reset
```

---

### Request History

#### GET /api/requests

Get recent request summary.

**Query Parameters:**
- `limit` - Number of requests to return (default: 50)

**Response:**
```json
[
  {
    "id": "request-uuid",
    "timestamp": "2024-12-17T10:30:45.123Z",
    "method": "POST",
    "path": "/v1/anthropic/v1/messages",
    "accountUsed": "account1",
    "statusCode": 200,
    "success": true,
    "errorMessage": null,
    "responseTimeMs": 1234,
    "failoverAttempts": 0,
    "model": "claude-sonnet-4-20250514",
    "promptTokens": 50,
    "completionTokens": 100,
    "totalTokens": 150,
    "inputTokens": 50,
    "outputTokens": 100,
    "cacheReadInputTokens": 0,
    "cacheCreationInputTokens": 0,
    "costUsd": 0.0125,
    "agentUsed": null,
    "tokensPerSecond": null
  }
]
```

**Example:**
```bash
curl "http://localhost:8080/api/requests?limit=100"
```

#### GET /api/requests/:requestId/detail

Get detailed request information for one exact stored request ID. Request and response bodies are base64-encoded to handle binary data and special characters. Unknown IDs return `404`; records without a stored payload return a metadata-only fallback.

**Response:**
```json
{
  "id": "request-uuid",
  "request": {
    "headers": {...},
    "body": "base64-encoded-body"
  },
  "response": {
    "status": 200,
    "headers": {...},
    "body": "base64-encoded-body"
  },
  "meta": {
    "trace": {
      "timestamp": 1234567890,
      "method": "POST",
      "path": "/v1/anthropic/v1/messages"
    },
    "account": {
      "id": "uuid",
      "name": "account1"
    },
    "transport": {
      "success": true,
      "pending": false,
      "retry": 0
    }
  }
}
```

**Example:**
```bash
curl "http://localhost:8080/api/requests/request-uuid/detail"
```

#### GET /api/requests/stream

Stream metadata-only real-time request events via Server-Sent Events (SSE). The stream emits ingress, start, and completed summary events; it never includes stored request or response bodies.

**Response:** SSE stream with request events

**Example:**
```bash
curl -N http://localhost:8080/api/requests/stream
```

---

### Configuration

#### GET /api/config

Get current configuration.

**Response:**
```json
{
  "lbStrategy": "session",
  "port": 8080,
  "sessionDurationMs": 18000000
}
```

**Example:**
```bash
curl http://localhost:8080/api/config
```

#### GET /api/config/strategy

Get current load balancing strategy.

**Response:**
```json
{
  "strategy": "session"
}
```

**Example:**
```bash
curl http://localhost:8080/api/config/strategy
```

#### POST /api/config/strategy

Update load balancing strategy.

**Request:**
```json
{
  "strategy": "session"
}
```

**Response:**
```json
{
  "success": true,
  "strategy": "session"
}
```

**Available Strategies:**
- `session` - Session-based routing that maintains 5-hour sessions with individual accounts to avoid rate limits and account bans

**⚠️ WARNING:** Only the session strategy is supported. Other strategies have been removed as they can trigger Claude's anti-abuse systems.

**Example:**
```bash
curl -X POST http://localhost:8080/api/config/strategy \
  -H "Content-Type: application/json" \
  -d '{"strategy": "session"}'
```

#### GET /api/strategies

List all available load balancing strategies.

**Response:**
```json
["session"]
```

**Example:**
```bash
curl http://localhost:8080/api/strategies
```

---

### Analytics

#### GET /api/analytics

Get detailed analytics data.

**Query Parameters:**
- `range` - Time range: `1h`, `6h`, `24h`, `7d`, `30d` (default: `24h`)
- `accounts` - Filter by account names (comma-separated list)
- `models` - Filter by model names (comma-separated list)
- `status` - Filter by request status: `all`, `success`, `error` (default: `all`)
- `mode` - Display mode: `normal`, `cumulative` (default: `normal`). Cumulative mode shows running totals over time
- `modelBreakdown` - Include per-model time series data: `true`, `false` (default: `false`)

**Response:**
```json
{
  "meta": {
    "range": "24h",
    "bucket": "1h",
    "cumulative": false
  },
  "totals": {
    "requests": 5000,
    "successRate": 98.5,
    "activeAccounts": 4,
    "avgResponseTime": 1250.5,
    "totalTokens": 1500000,
    "totalCostUsd": 125.50,
    "avgTokensPerSecond": null
  },
  "timeSeries": [
    {
      "ts": 1734430800000,
      "requests": 100,
      "tokens": 15000,
      "costUsd": 1.25,
      "successRate": 98,
      "errorRate": 2,
      "cacheHitRate": 15,
      "avgResponseTime": 1200,
      "avgTokensPerSecond": null
    }
  ],
  "tokenBreakdown": {
    "inputTokens": 500000,
    "cacheReadInputTokens": 100000,
    "cacheCreationInputTokens": 50000,
    "outputTokens": 850000
  },
  "modelDistribution": [
    {"model": "claude-3-opus-20240229", "count": 3000}
  ],
  "accountPerformance": [
    {"name": "account1", "requests": 2500, "successRate": 99}
  ],
  "costByModel": [
    {"model": "claude-3-opus-20240229", "costUsd": 100.50, "requests": 3000, "totalTokens": 1200000}
  ],
  "modelPerformance": [
    {
      "model": "claude-3-opus-20240229",
      "avgResponseTime": 1300,
      "p95ResponseTime": 2500,
      "errorRate": 1.5,
      "avgTokensPerSecond": null,
      "minTokensPerSecond": null,
      "maxTokensPerSecond": null
    }
  ]
}
```

**Examples:**
```bash
# Basic analytics for last 7 days
curl "http://localhost:8080/api/analytics?range=7d"

# Analytics filtered by specific accounts
curl "http://localhost:8080/api/analytics?range=24h&accounts=account1,account2"

# Analytics for specific models with success status only
curl "http://localhost:8080/api/analytics?range=24h&models=claude-3-opus-20240229,claude-3-sonnet-20240229&status=success"

# Combined filters
curl "http://localhost:8080/api/analytics?range=7d&accounts=premium1,premium2&models=claude-3-opus-20240229&status=error"
```

---

### Maintenance

#### POST /api/maintenance/cleanup

Run data cleanup based on configured retention settings.

**Example:**
```bash
curl -X POST http://localhost:8080/api/maintenance/cleanup
```

#### POST /api/maintenance/compact

Compact the database to reclaim disk space.

**Example:**
```bash
curl -X POST http://localhost:8080/api/maintenance/compact
```

---

### Data Retention

#### GET /api/config/retention

Get current data retention settings.

**Response:**
```json
{
  "payloadDays": 7,
  "requestDays": 30
}
```

**Example:**
```bash
curl http://localhost:8080/api/config/retention
```

#### POST /api/config/retention

Update data retention settings.

**Request:**
```json
{
  "payloadDays": 14,
  "requestDays": 90
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/config/retention \
  -H "Content-Type: application/json" \
  -d '{"payloadDays": 14, "requestDays": 90}'
```

---

### Logs

#### GET /api/logs/stream

Stream real-time logs via Server-Sent Events (SSE).

**Response:** SSE stream with log events

**Example:**
```bash
curl -N http://localhost:8080/api/logs/stream
```

#### GET /api/logs/history

Get historical logs.

**Response:**
```json
[
  {
    "timestamp": "2024-12-17T10:30:45.123Z",
    "level": "info",
    "component": "proxy",
    "message": "Request completed",
    "metadata": {...}
  }
]
```

**Example:**
```bash
curl http://localhost:8080/api/logs/history
```

---

## Error Handling

All API errors follow a consistent format:

```json
{
  "error": "Error message",
  "details": {
    // Optional additional error details
  }
}
```

### Common Status Codes

- **200 OK** - Request successful
- **400 Bad Request** - Invalid request parameters
- **404 Not Found** - Resource not found
- **429 Too Many Requests** - Rate limited
- **500 Internal Server Error** - Server error
- **502 Bad Gateway** - Upstream provider error
- **503 Service Unavailable** - All accounts failed

### Rate Limiting

When an account hits rate limits, ccflare automatically fails over to the next available account. If all accounts are rate limited, a 503 error is returned.

Rate limit information is included in account responses:
- `rateLimitStatus` - Current status (e.g., "allowed", "allowed_warning", "rate_limited")
- `rateLimitReset` - When the rate limit resets
- `rateLimitRemaining` - Remaining requests (if available)

---

## Streaming Responses

The proxy endpoints support streaming responses for compatible Claude API calls. When making a streaming request:

1. Include `"stream": true` in your request body
2. The response will be `Content-Type: text/event-stream`
3. Each chunk is delivered as a Server-Sent Event

**Streaming Response Capture:**
ccflare automatically captures streaming response bodies for analytics and debugging purposes:
- Captured data is limited to `CF_STREAM_BODY_MAX_BYTES` (default: 256KB)
- The capture process doesn't interfere with the client's stream
- Captured bodies are stored base64-encoded in the request history
- If the response exceeds the size limit, it's marked as truncated in metadata

**Example:**
```bash
curl -X POST http://localhost:8080/v1/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Write a poem"}],
    "max_tokens": 100,
    "stream": true
  }'
```

---

## Dashboard

A web dashboard is available at:

```
http://localhost:8080/          # Dashboard
```

The dashboard provides a visual interface for:
- Monitoring account status and usage
- Viewing real-time analytics
- Managing configuration
- Examining request history

---

## Configuration

### Environment Variables

ccflare can be configured using the following environment variables:

- `PORT` - Server port (default: 8080)
- `LB_STRATEGY` - Load balancing strategy (default: session)
- `SESSION_DURATION_MS` - Session duration in milliseconds (default: 18000000 / 5 hours)
- `CLIENT_ID` - OAuth client ID for Anthropic authentication (default: 9d1c250a-e61b-44d9-88ed-5944d1962f5e)
- `CF_STREAM_BODY_MAX_BYTES` - Maximum bytes to capture from streaming responses (default: 262144 / 256KB)
- `RETRY_ATTEMPTS` - Number of retry attempts for failed requests (default: 3)
- `RETRY_DELAY_MS` - Initial delay between retries in milliseconds (default: 1000)
- `RETRY_BACKOFF` - Exponential backoff multiplier for retries (default: 2)

### Configuration File

In addition to environment variables, ccflare supports configuration through a JSON file. The config file location varies by platform:
- macOS/Linux: `~/.config/ccflare/ccflare.json` (or `$XDG_CONFIG_HOME/ccflare/ccflare.json`)
- Windows: `%LOCALAPPDATA%\ccflare\ccflare.json` (or `%APPDATA%\ccflare\ccflare.json`)

**Supported Configuration Keys:**
```json
{
  "lb_strategy": "session",
  "client_id": "your-oauth-client-id",
  "retry_attempts": 3,
  "retry_delay_ms": 1000,
  "retry_backoff": 2,
  "session_duration_ms": 18000000,
  "port": 8080,
  "stream_body_max_bytes": 262144
}
```

**Note:** Environment variables take precedence over config file settings.

### Load Balancing Strategies

The following strategy is available:
- `session` - Session-based routing that maintains 5-hour sessions with individual accounts

**⚠️ WARNING:** Only use the session strategy. Other strategies can trigger Claude's anti-abuse systems and result in account bans.

## Notes

1. **No Authentication**: The API endpoints do not require authentication. ccflare manages the OAuth tokens internally for proxying to Claude.

2. **Automatic Failover**: When a request fails or an account is rate limited, ccflare automatically tries the next available account. If no accounts are available, requests are forwarded without authentication as a fallback.

3. **Token Refresh**: Access tokens are automatically refreshed when they expire.

4. **Request Logging**: All requests are logged with detailed metrics including tokens used, cost, and response times. Database writes are performed asynchronously to avoid blocking request processing.

5. **Session Affinity**: The "session" strategy maintains sticky sessions for consistent routing within a time window.

6. **Rate Limit Tracking**: Rate limit information is automatically extracted from responses and stored for each account, including reset times and remaining requests.

7. **Provider Filtering**: Accounts are automatically filtered by provider when selecting for requests, ensuring compatibility.
