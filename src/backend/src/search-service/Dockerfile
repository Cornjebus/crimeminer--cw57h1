# Stage 1: Security Scanner
FROM aquasec/trivy:latest AS security-scanner
WORKDIR /scan
COPY . .
RUN trivy filesystem --exit-code 1 --severity HIGH,CRITICAL .

# Stage 2: Builder
FROM node:18-alpine AS builder

# Create non-root user/group
RUN addgroup -S crimeminer && adduser -S crimeminer -G crimeminer

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Security audit and install dependencies
RUN npm audit && \
    npm ci --ignore-scripts && \
    npm audit fix

# Copy source code and security configs
COPY --chown=crimeminer:crimeminer . .

# Security checks and build
RUN npm run security:scan && \
    npm run build && \
    npm run test && \
    npm prune --production && \
    # Generate SBOM
    npm list --json > sbom.json

# Stage 3: Production
FROM node:18-alpine

# Security updates and hardening
RUN apk update && \
    apk upgrade && \
    apk add --no-cache dumb-init && \
    addgroup -S crimeminer && \
    adduser -S crimeminer -G crimeminer && \
    mkdir -p /usr/src/app && \
    chown -R crimeminer:crimeminer /usr/src/app

# Set working directory
WORKDIR /usr/src/app

# Copy package files and built artifacts
COPY --from=builder --chown=crimeminer:crimeminer /usr/src/app/package*.json ./
COPY --from=builder --chown=crimeminer:crimeminer /usr/src/app/dist ./dist
COPY --from=builder --chown=crimeminer:crimeminer /usr/src/app/sbom.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Security configurations
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Resource limits
RUN echo "crimeminer soft nofile 65535" >> /etc/security/limits.conf && \
    echo "crimeminer hard nofile 65535" >> /etc/security/limits.conf && \
    echo "crimeminer soft nproc 1024" >> /etc/security/limits.conf && \
    echo "crimeminer hard nproc 1024" >> /etc/security/limits.conf

# Compliance and audit logging
RUN mkdir -p /var/log/crimeminer && \
    chown crimeminer:crimeminer /var/log/crimeminer

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Set user
USER crimeminer

# Security options
LABEL org.opencontainers.image.vendor="CrimeMiner" \
      org.opencontainers.image.title="Search Service" \
      org.opencontainers.image.description="CrimeMiner Search Service" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/crimeminer/search-service" \
      security.fedramp.compliance="high" \
      security.cjis.compliance="enabled"

# Start application with dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]

# Additional security measures
RUN chmod -R 550 /usr/src/app && \
    chmod -R 440 /usr/src/app/package*.json && \
    chmod -R 440 /usr/src/app/sbom.json

# Read-only root filesystem
VOLUME ["/tmp", "/var/log/crimeminer"]