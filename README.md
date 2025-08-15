# ccflare 🛡️

**Track Every Request. Go Low-Level. Never Hit Rate Limits Again.**

The ultimate Claude API proxy with intelligent load balancing across multiple accounts. Full visibility into every request, response, and rate limit.


https://github.com/user-attachments/assets/c859872f-ca5e-4f8b-b6a0-7cc7461fe62a


![ccflare Dashboard](apps/lander/src/screenshot-dashboard.png)

## Why ccflare?

- **🚀 Zero Rate Limit Errors** - Automatically distribute requests across multiple accounts
- **📊 Request-Level Analytics** - Track latency, token usage, and costs in real-time  
- **🔍 Deep Debugging** - Full request/response logging and error traces
- **⚡ <10ms Overhead** - Minimal performance impact on your API calls
- **💸 Free & Open Source** - Run it yourself, modify it, own your infrastructure

## Quick Start

### With Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/snipeship/ccflare
cd ccflare

# Build and run with Docker
docker build -t ccflare .
docker run -p 8080:8080 ccflare

# Configure Claude SDK
export ANTHROPIC_BASE_URL=http://localhost:8080
```

### With Bun

```bash
# Clone and install
git clone https://github.com/snipeship/ccflare
cd ccflare
bun install

# Start ccflare (TUI + Server)
bun run ccflare

# Configure Claude SDK
export ANTHROPIC_BASE_URL=http://localhost:8080
```

## Features

### 🎯 Intelligent Load Balancing
- **Strategies Supported**:
  - **session** – Maintain session stickiness for up to 5 hours per account.

### 📈 Real-Time Analytics
- Token usage tracking per request
- Response time monitoring
- Rate limit detection and warnings
- Cost estimation and budgeting

### 🛠️ Developer Tools
- Interactive TUI (`bun run ccflare`)
- Web dashboard (`http://localhost:8080/dashboard`)
- CLI for account management
- REST API for automation

### 🔒 Production Ready
- Automatic failover between accounts
- OAuth token refresh handling
- SQLite database for persistence
- Configurable retry logic
- Authentication (default credentials are ccflare_user : ccflare_password)
- Docker deployment

## Documentation

Full documentation available in [`docs/`](docs/):
- [Getting Started](docs/index.md)
- [Architecture](docs/architecture.md) 
- [API Reference](docs/api-http.md)
- [Configuration](docs/configuration.md)
- [Load Balancing Strategies](docs/load-balancing.md)

## Screenshots

<table>
  <tr>
    <td><img src="apps/lander/src/screenshot-dashboard.png" alt="Dashboard"/></td>
    <td><img src="apps/lander/src/screenshot-logs.png" alt="Logs"/></td>
  </tr>
  <tr>
    <td align="center"><b>Real-time Dashboard</b></td>
    <td align="center"><b>Request Logs</b></td>
  </tr>
  <tr>
    <td colspan="2"><img src="apps/lander/src/screenshot-analytics.png" alt="Analytics"/></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><b>Analytics & Usage Tracking</b></td>
  </tr>
</table>

## Requirements

- [Bun](https://bun.sh) >= 1.2.8
- Claude API accounts (Free, Pro, or Team)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/contributing.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE) for details

---

<p align="center">
  Built with ❤️ for developers who ship
</p>