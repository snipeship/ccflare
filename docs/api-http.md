# ccflare HTTP API Documentation

## Quick Start

```bash
# Check health status
curl http://localhost:8080/health

# Proxy a request to Claude
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# List all accounts
curl http://localhost:8080/api/accounts

# View dashboard
open http://localhost:8080/dashboard
```

## Overview

ccflare provides a RESTful HTTP API for managing accounts, monitoring usage, and proxying requests to Claude. The API runs on port 8080 by default. Dashboard access requires authentication while API endpoints remain open for compatibility.

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
  "strategy": "session"
}
```

**Example:**
```bash
curl http://localhost:8080/health
```

---

### Claude Proxy

#### /v1/* (All Methods)

Proxy requests to Claude API. All requests to paths starting with `/v1/` are forwarded to Claude using the configured load balancing strategy. This includes POST, GET, and any other HTTP methods that Claude's API supports.

**Supported Endpoints:**
- `POST /v1/messages` - Create chat completions
- `POST /v1/complete` - Text completion (legacy)
- Any other Claude API v1 endpoint

**Note:** There is no `/v1/models` endpoint provided by ccflare. Model listing would need to be done directly through Claude's API if such an endpoint exists.

**Headers:**
- All standard Claude API headers are supported
- `Authorization` header is managed by ccflare (no need to provide)

**Request Body:**
Same as Claude API requirements for the specific endpoint.

**Response:**
Proxied response from Claude API, including streaming responses.

**Automatic Failover:**
If a request fails or an account is rate limited, ccflare automatically retries with the next available account according to the configured load balancing strategy. This ensures high availability and reliability.

**Example:**
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

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
    "requestCount": 150,
    "totalRequests": 1500,
    "lastUsed": "2024-12-17T10:25:30.123Z",
    "created": "2024-12-01T08:00:00.000Z",
    "tier": 5,
    "paused": false,
    "tokenStatus": "valid",
    "rateLimitStatus": "allowed_warning (5m)",
    "rateLimitReset": "2024-12-17T10:30:00.000Z",
    "rateLimitRemaining": 100,
    "sessionInfo": "Session: 25 requests"
  }
]
```

**Example:**
```bash
curl http://localhost:8080/api/accounts
```

---

### OAuth Flow

#### POST /api/oauth/init

Initialize OAuth flow for adding a new account.

**Request:**
```json
{
  "name": "myaccount",
  "mode": "max",  // "max" or "console" (default: "max")
  "tier": 5       // 1, 5, or 20 (default: 1)
}
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://console.anthropic.com/oauth/authorize?...",
  "sessionId": "uuid-here",
  "step": "authorize"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/oauth/init \
  -H "Content-Type: application/json" \
  -d '{"name": "myaccount", "mode": "max", "tier": 5}'
```

#### POST /api/oauth/callback

Complete OAuth flow after user authorization.

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
  "mode": "Claude Max",
  "tier": 5
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "uuid-here", "code": "auth-code"}'
```

---

### Account Management

#### DELETE /api/accounts/:accountId

Remove an account. Requires confirmation.

**Request:**
```json
{
  "confirm": "account-name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account 'account-name' removed successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8080/api/accounts/uuid-here \
  -H "Content-Type: application/json" \
  -d '{"confirm": "myaccount"}'
```

#### POST /api/accounts/:accountId/tier

Update account tier.

**Request:**
```json
{
  "tier": 5  // 1, 5, or 20
}
```

**Response:**
```json
{
  "success": true,
  "tier": 5
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/accounts/uuid-here/tier \
  -H "Content-Type: application/json" \
  -d '{"tier": 20}'
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
    "path": "/v1/messages",
    "accountUsed": "account1",
    "statusCode": 200,
    "success": true,
    "errorMessage": null,
    "responseTimeMs": 1234,
    "failoverAttempts": 0,
    "model": "claude-3-opus-20240229",
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

#### GET /api/requests/detail

Get detailed request information including payloads. Request and response bodies are base64-encoded to handle binary data and special characters.

**Query Parameters:**
- `limit` - Number of requests to return (default: 100)

**Response:**
```json
[
  {
    "id": "request-uuid",
    "timestamp": "2024-12-17T10:30:45.123Z",
    "method": "POST",
    "path": "/v1/messages",
    "accountUsed": "account1",
    "statusCode": 200,
    "success": true,
    "payload": {
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
        "accountId": "uuid",
        "accountName": "account1",
        "retry": 0,
        "timestamp": 1234567890,
        "success": true,
        "rateLimited": false,
        "accountsAttempted": 1
      }
    }
  }
]
```

**Example:**
```bash
curl "http://localhost:8080/api/requests/detail?limit=10"
```

---

### Configuration

#### GET /api/config

Get current configuration.

**Response:**
```json
{
  "lb_strategy": "session",
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

### Agent Management

#### GET /api/agents

List all available agents with their preferences.

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-uuid",
      "name": "code-reviewer",
      "description": "Reviews code for quality and best practices",
      "model": "claude-3-5-sonnet-20241022",
      "source": "global",
      "workspace": null
    }
  ],
  "globalAgents": [...],
  "workspaceAgents": [...],
  "workspaces": [
    {
      "name": "my-workspace",
      "path": "/path/to/workspace"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8080/api/agents
```

#### POST /api/agents/:agentId/preference

Update model preference for a specific agent.

**Request:**
```json
{
  "model": "claude-3-5-sonnet-20241022"
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "agent-uuid",
  "model": "claude-3-5-sonnet-20241022"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/agents/agent-uuid/preference \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022"}'
```

#### GET /api/workspaces

List all available workspaces with agent counts.

**Response:**
```json
{
  "workspaces": [
    {
      "name": "my-workspace",
      "path": "/path/to/workspace",
      "agentCount": 5
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8080/api/workspaces
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
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Write a poem"}],
    "max_tokens": 100,
    "stream": true
  }'
```

---

## Dashboard

A web dashboard is available at:

```
http://localhost:8080/dashboard
http://localhost:8080/          # Redirects to /dashboard
```

The dashboard provides a visual interface for:
- Monitoring account status and usage
- Viewing real-time analytics
- Managing configuration
- Examining request history

### Dashboard Authentication

The dashboard requires authentication to access. Default credentials:
- **Username**: `ccflare_user`
- **Password**: `ccflare_password`

Authentication is handled via a database-backed user system. The default user is created automatically on first run.

**Note**: The previous environment variables `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` are now deprecated and no longer used.

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
- macOS: `~/Library/Application Support/ccflare/config.json`
- Linux: `~/.config/ccflare/config.json`
- Windows: `%APPDATA%\ccflare\config.json`

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

## Authentication

### API Endpoints

API endpoints (`/api/*`) do not require authentication for backward compatibility. They are designed for programmatic access and internal use.

### Dashboard Authentication

The web dashboard (`/dashboard`) does not require authentication, unless enabled with an environment variable `AUTH_ENABLED=(boolean)`. If enabled, default credentials are `ccflare_user` for the username, and `ccflare_password` for the password.

#### POST /api/auth/login

Login to the dashboard.

**Request:**
```json
{
  "username": "ccflare_user",
  "password": "ccflare_password"
}
```

**Response:**
```json
{
  "success": true
}
```

Sets an HTTP-only session cookie for authentication.

#### POST /api/auth/logout

Logout from the dashboard.

**Response:**
```json
{
  "success": true
}
```

#### GET /api/auth/check

Check authentication status.

**Response:**
```json
{
  "authenticated": true
}
```

## Notes

1. **API Authentication**: The API endpoints do not require authentication. ccflare manages the OAuth tokens internally for proxying to Claude.

2. **Automatic Failover**: When a request fails or an account is rate limited, ccflare automatically tries the next available account. If no accounts are available, requests are forwarded without authentication as a fallback.

3. **Token Refresh**: Access tokens are automatically refreshed when they expire.

4. **Request Logging**: All requests are logged with detailed metrics including tokens used, cost, and response times. Database writes are performed asynchronously to avoid blocking request processing.

5. **Account Tiers**: Accounts can have different tiers (1, 5, or 20) which affect their weight in certain load balancing strategies.

6. **Session Affinity**: The "session" strategy maintains sticky sessions for consistent routing within a time window.

7. **Rate Limit Tracking**: Rate limit information is automatically extracted from responses and stored for each account, including reset times and remaining requests.

8. **Provider Filtering**: Accounts are automatically filtered by provider when selecting for requests, ensuring compatibility.