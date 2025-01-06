# Builder stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install build dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    USER=node

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    tini \
    ffmpeg \
    # Clean up
    && rm -rf /var/cache/apk/*

# Create app directory and set permissions
WORKDIR /app
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Copy built artifacts from builder stage
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Configure security options
RUN mkdir -p /app/logs && \
    chmod 755 /app/logs

# Set resource limits
LABEL com.crimeminer.resource.cpu="2" \
      com.crimeminer.resource.memory="4GB" \
      com.crimeminer.resource.pids="100" \
      com.crimeminer.resource.nofile="1000"

# Configure security labels
LABEL com.crimeminer.security.no-new-privileges="true" \
      com.crimeminer.security.read-only="true" \
      com.crimeminer.security.capabilities="none" \
      com.crimeminer.security.seccomp="default"

# Expose service port
EXPOSE 3000

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Set default command
CMD ["node", "--max-old-space-size=4096", "dist/index.js"]

# Apply security options at runtime
STOPSIGNAL SIGTERM

# Configure read-only root filesystem
VOLUME ["/app/logs"]

# Set immutable filesystem tags
RUN touch /app/.dockerfile_built && \
    chmod 444 /app/.dockerfile_built

# Add security headers
LABEL org.opencontainers.image.vendor="CrimeMiner" \
      org.opencontainers.image.title="Evidence Service" \
      org.opencontainers.image.description="FedRAMP High and CJIS compliant evidence processing service" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="Private" \
      org.opencontainers.image.created="2024-01-01" \
      org.opencontainers.image.url="https://crimeminer.gov" \
      org.opencontainers.image.documentation="https://docs.crimeminer.gov" \
      org.opencontainers.image.source="https://github.com/crimeminer/evidence-service" \
      org.opencontainers.image.revision="v1.0.0" \
      org.opencontainers.image.vendor.fedramp="High" \
      org.opencontainers.image.vendor.cjis="Compliant"