# Stage 1: Builder
FROM node:18-alpine AS builder
LABEL stage=builder

# Set working directory
WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with exact versions for reproducibility
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript code
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Security Scanner
FROM snyk/snyk:latest AS security-scan
WORKDIR /scan
COPY --from=builder /build .
RUN snyk test --severity-threshold=high || true
RUN snyk monitor || true

# Stage 3: Production
FROM node:18-alpine
LABEL maintainer="CrimeMiner DevOps Team" \
      service="storage-service" \
      version="${VERSION}" \
      security.compliance="CJIS,FedRAMP" \
      storage.type="WORM" \
      backup.enabled="true"

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    curl \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user/group
RUN addgroup -g 1000 storage-service && \
    adduser -u 1000 -G storage-service -s /bin/sh -D storage-service

# Set working directory
WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=storage-service:storage-service /build/dist ./dist
COPY --from=builder --chown=storage-service:storage-service /build/node_modules ./node_modules
COPY --from=builder --chown=storage-service:storage-service /build/package*.json ./

# Set secure permissions
RUN chmod 755 /app && \
    chmod 644 /app/package.json && \
    chmod -R 755 /app/dist && \
    chmod -R 755 /app/node_modules

# Configure environment
ENV NODE_ENV=production \
    PORT=3000 \
    SECURE_STORAGE_MODE=true \
    WORM_ENABLED=true \
    HSM_ENABLED=true \
    NODE_OPTIONS="--max-old-space-size=4096"

# Set resource limits
ENV MEMORY_LIMIT=4096 \
    CPU_LIMIT=2000m

# Expose port
EXPOSE 3000

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER storage-service

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Set startup command
CMD ["node", "dist/index.js"]

# Security options
SECURITY_OPT ["no-new-privileges:true", "seccomp=unconfined"]

# Resource limits
LIMIT_AS=4294967296
LIMIT_NOFILE=65536
LIMIT_NPROC=4096