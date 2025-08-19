# Multi-stage build for ccflare
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package.json bun.lock* ./

# Copy all source code (required for workspace dependencies)
COPY . .

# Install dependencies
RUN bun install --frozen-lockfile

# Build the project
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Install SQLite tools for database repair and debugging
RUN apk add --no-cache sqlite

# Create non-root user
RUN addgroup -g 1001 -S ccflare && \
    adduser -S ccflare -u 1001 -G ccflare

# Copy built application
COPY --from=builder --chown=ccflare:ccflare /app .

# Copy repair scripts
COPY --chown=ccflare:ccflare scripts/ /app/scripts/
RUN find /app/scripts -name '*.sh' -type f -exec chmod +x {} + 2>/dev/null || true

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown ccflare:ccflare /app/data

# Switch to non-root user
USER ccflare

# Set API key for authentication (change this in production!)
ENV API_KEY=ccflare-default-key

# Set database path to persistent volume mount
ENV ccflare_DB_PATH=/app/data/ccflare.db

# Expose port
EXPOSE 8080

# Start the server (not TUI)
CMD ["bun", "run", "server"]