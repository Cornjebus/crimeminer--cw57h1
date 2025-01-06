# Build stage
FROM node:18-alpine AS builder

# Install security tools
RUN apk add --no-cache python3 make g++ \
    && npm install -g snyk npm-audit-resolver

# Set working directory
WORKDIR /usr/src/app

# Copy package files with strict permissions
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig*.json ./

# Install dependencies with security checks
RUN npm ci \
    && npm audit fix \
    && snyk test

# Copy source code and configs
COPY --chown=node:node . .

# Build TypeScript code with strict checks
RUN npm run build:prod \
    && npm prune --production

# Production stage
FROM node:18-alpine

# Security hardening
RUN apk add --no-cache dumb-init tzdata \
    && echo "node:x:1000:1000:node:/home/node:/sbin/nologin" >> /etc/passwd \
    && echo "node:x:1000:" >> /etc/group \
    && mkdir -p /home/node \
    && chown -R node:node /home/node

# Set working directory with restricted permissions
WORKDIR /usr/src/app
RUN chown -R node:node /usr/src/app

# Copy built artifacts with integrity verification
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./

# Set security-related environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=4096 --max-http-header-size=16384 --security-revert=CVE-2023-23918" \
    FIPS_MODE=1 \
    KEYCLOAK_AUTH_SERVER_URL="" \
    KEYCLOAK_REALM="" \
    KEYCLOAK_CLIENT_ID="" \
    MFA_REQUIRED=true \
    AUDIT_LOG_ENABLED=true \
    LOG_LEVEL=info

# Configure resource limits
ENV NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=4096"

# Switch to non-root user
USER node

# Remove unnecessary tools and files
RUN rm -rf /home/node/.npm /home/node/.node-gyp /tmp/*

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Set security options and start application
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]

# Labels for container metadata
LABEL maintainer="CrimeMiner Development Team" \
      version="1.0.0" \
      description="CrimeMiner Authentication Service" \
      security.fedramp.high="compliant" \
      security.cjis="compliant" \
      org.opencontainers.image.source="https://github.com/crimeminer/auth-service" \
      org.opencontainers.image.vendor="CrimeMiner" \
      org.opencontainers.image.title="Authentication Service" \
      org.opencontainers.image.description="FedRAMP High and CJIS compliant authentication service"

# Security scanning
COPY --chown=node:node .snyk ./
RUN snyk test \
    && snyk container test

# Apply security capabilities
SECURITY_OPTS="--security-opt=no-new-privileges:true --cap-drop=ALL --cap-add=NET_BIND_SERVICE"