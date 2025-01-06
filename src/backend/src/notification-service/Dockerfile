# Stage 1: Builder
FROM node:20-alpine AS builder

# Install build dependencies and security tools
RUN apk add --no-cache python3 make g++ git curl

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code with optimizations
RUN npm run build

# Run security audit
RUN npm audit

# Remove devDependencies and build artifacts
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine

# Install Tini for proper process management
ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini

# Create non-root user and group
RUN addgroup -g 1001 crimeminer && \
    adduser -u 1001 -G crimeminer -s /bin/sh -D crimeminer

# Set working directory
WORKDIR /usr/src/app

# Copy built artifacts from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Set security configurations
RUN apk add --no-cache dumb-init && \
    chmod -R 550 /usr/src/app && \
    chown -R crimeminer:crimeminer /usr/src/app

# Set Node.js production configurations
ENV NODE_ENV=production
ENV PORT=3006
ENV NODE_OPTIONS="--max-old-space-size=4096 --max-http-header-size=16384"

# Configure health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Set resource limits
RUN ulimit -n 1024 && \
    ulimit -u 50

# Configure logging and monitoring
ENV NODE_OPTIONS="${NODE_OPTIONS} -r @opentelemetry/auto-instrumentations-node"

# Expose metrics endpoint
EXPOSE 9090

# Expose application port
EXPOSE ${PORT}

# Switch to non-root user
USER crimeminer

# Set entrypoint with Tini
ENTRYPOINT ["/tini", "--"]

# Start notification service with clustering
CMD ["node", "dist/cluster.js"]

# Labels for container metadata
LABEL maintainer="CrimeMiner Development Team" \
      version="1.0.0" \
      description="CrimeMiner Notification Service" \
      org.opencontainers.image.source="https://github.com/crimeminer/crimeminer" \
      org.opencontainers.image.licenses="UNLICENSED" \
      security.fedramp.compliant="true" \
      security.cjis.compliant="true"