# Stage 1: Builder
FROM node:20-alpine AS builder

# Install security scanning tools
RUN apk add --no-cache python3 py3-pip curl \
    && pip3 install --no-cache-dir trivy-scanner safety

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies with integrity check
RUN yarn install --frozen-lockfile --production=false \
    && yarn cache clean

# Security audit
RUN yarn audit \
    && yarn test:security

# Copy source code and configs
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript code with strict checks
RUN yarn build:prod

# Run security scanning
RUN trivy filesystem --exit-code 1 --no-progress --severity HIGH,CRITICAL . \
    && safety check

# Prune dev dependencies
RUN yarn install --frozen-lockfile --production=true \
    && yarn cache clean

# Generate SBOM
RUN trivy fs --format cyclonedx --output sbom.json .

# Stage 2: Production
FROM node:20-alpine

# Install security packages
RUN apk add --no-cache \
    dumb-init \
    curl \
    tini \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/sbom.json ./

# Verify artifact integrity
RUN yarn verify-integrity

# Create non-root user
RUN addgroup -S crimeminer && adduser -S crimeminer -G crimeminer

# Configure logging
RUN mkdir -p /var/log/crimeminer \
    && chown -R crimeminer:crimeminer /var/log/crimeminer

# Set permissions
RUN chown -R crimeminer:crimeminer /app \
    && chmod -R 550 /app/dist \
    && chmod -R 500 /app/node_modules

# Set security configurations
RUN echo "kernel.unprivileged_userns_clone=0" >> /etc/sysctl.conf \
    && echo "fs.protected_hardlinks=1" >> /etc/sysctl.conf \
    && echo "fs.protected_symlinks=1" >> /etc/sysctl.conf

# Switch to non-root user
USER crimeminer

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Set security labels
LABEL compliance.fedramp="high" \
      compliance.cjis="enabled" \
      security.baseline="enhanced"

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application with security flags
CMD ["node", "--security-revert=CVE-2023-23918", "--disable-proto=delete", "./dist/index.js"]

# Expose application port
EXPOSE ${PORT}

# Configure security options
SECURITY_OPT="no-new-privileges:true"