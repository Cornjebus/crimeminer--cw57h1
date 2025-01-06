# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with security best practices
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --only=production \
    && npm cache clean --force \
    && apk del .build-deps

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build \
    && npm prune --production

# Verify build artifacts
RUN test -d dist && test -f dist/index.js

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set non-root user and group
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Security hardening
RUN apk add --no-cache wget tzdata \
    && chmod -R 555 /app \
    && chown -R appuser:appgroup /app \
    && mkdir -p /app/logs \
    && chown -R appuser:appgroup /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV TZ=UTC

# Configure security options
USER appuser:appgroup
RUN mkdir -p /tmp/app && chown appuser:appgroup /tmp/app
WORKDIR /tmp/app

# Set resource limits
ENV MEMORY_LIMIT="2GB"
ENV CPU_LIMIT="1.0"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:3000/health || exit 1

# Expose API port
EXPOSE 3000

# Set labels
LABEL maintainer="CrimeMiner" \
    version="1.0.0" \
    description="API Gateway service for CrimeMiner platform" \
    compliance="FedRAMP-High,CJIS" \
    security.scan-required="true" \
    build-date="${BUILD_DATE}"

# Set production entrypoint
ENTRYPOINT ["node", "dist/index.js"]

# Apply security configurations
RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
    && echo "net.ipv4.ip_local_port_range = 1024 65000" >> /etc/sysctl.conf \
    && echo "net.ipv4.tcp_fin_timeout = 30" >> /etc/sysctl.conf

# Drop all capabilities except those required
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node

# Set security options
SECURITY_OPT no-new-privileges:true
SECURITY_OPT seccomp=unconfined

# Set read-only root filesystem
VOLUME ["/tmp/app/logs"]
READONLY_ROOTFS true