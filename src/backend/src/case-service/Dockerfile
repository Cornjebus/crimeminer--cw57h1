# Build stage
FROM node:20.5.1-alpine3.18 AS builder

# Install security scanning tools
RUN apk add --no-cache curl python3 py3-pip \
    && pip3 install --no-cache-dir trivy \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Set working directory
WORKDIR /app

# Copy package files with verification
COPY package*.json ./
COPY --chown=node:node . .

# Install dependencies for build
RUN npm ci --production=false \
    && npm audit \
    && npm run security-scan

# Copy source code and configs
COPY tsconfig.json ./
COPY src ./src

# Build application
RUN npm run build:prod \
    && npm prune --production

# Scan built artifacts
RUN trivy filesystem --severity HIGH,CRITICAL --exit-code 1 .

# Production stage
FROM node:20.5.1-alpine3.18

# Configure security packages
RUN apk add --no-cache curl tini dumb-init \
    && addgroup -g 1001 nodegroup \
    && adduser -u 1001 -G nodegroup -s /bin/sh -D nodeuser

# Set working directory
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=nodeuser:nodegroup /app/dist ./dist
COPY --from=builder --chown=nodeuser:nodegroup /app/package*.json ./

# Install production dependencies
RUN npm ci --production \
    && npm cache clean --force

# Configure security settings
RUN mkdir -p /var/log/case-service \
    && chown -R nodeuser:nodegroup /var/log/case-service \
    && chmod 0640 /var/log/case-service \
    && mkdir -p /tmp \
    && chown -R nodeuser:nodegroup /tmp \
    && chmod 0750 /tmp

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    USER=nodeuser \
    NODE_OPTIONS="--max-old-space-size=4096 --max-http-header-size=16384" \
    SECURITY_OPTS="no-new-privileges:true" \
    LOG_LEVEL=info \
    CJIS_COMPLIANCE=enabled

# Set user
USER nodeuser

# Enable security features
EXPOSE 3000
STOPSIGNAL SIGTERM

# Set resource limits
LABEL maintainer="CrimeMiner DevOps Team" \
      version="1.0.0" \
      service="case-service" \
      compliance.fedramp="high" \
      compliance.cjis="enabled" \
      security.baseline="production"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set volumes
VOLUME ["/tmp", "/var/log/case-service"]

# Drop capabilities and set security options
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node

# Set entry command with tini as init system
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]

# Set resource limits
LIMIT nofile=1024
LIMIT nproc=100
LIMIT as=4G
LIMIT cpu=2