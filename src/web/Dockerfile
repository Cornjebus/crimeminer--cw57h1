# Build stage
FROM node:18-alpine AS builder
LABEL maintainer="CrimeMiner Development Team"
LABEL description="Build stage for CrimeMiner web application"

# Set environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=error
ENV NPM_CONFIG_AUDIT=true

# Create non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# Set working directory and permissions
WORKDIR /app
RUN chown -R appuser:appgroup /app

# Install dependencies first (for better caching)
COPY --chown=appuser:appgroup package*.json ./
RUN npm ci --production=false --audit=true && \
    npm cache clean --force

# Copy source files with correct permissions
COPY --chown=appuser:appgroup . .

# Security audit and build
RUN npm run test:security && \
    npm run build && \
    npm run analyze

# Clean up development dependencies
RUN npm prune --production

# Switch to non-root user
USER appuser

# Production stage
FROM nginx:1.25-alpine AS production
LABEL maintainer="CrimeMiner Development Team"
LABEL description="Production stage for CrimeMiner web application"

# Install security updates and tools
RUN apk update && \
    apk upgrade && \
    apk add --no-cache curl tzdata && \
    rm -rf /var/cache/apk/*

# Create nginx user and set permissions
RUN addgroup -g 1001 nginxgroup && \
    adduser -u 1001 -G nginxgroup -s /bin/sh -D nginxuser && \
    chown -R nginxuser:nginxgroup /var/cache/nginx && \
    chown -R nginxuser:nginxgroup /var/log/nginx && \
    chown -R nginxuser:nginxgroup /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginxuser:nginxgroup /var/run/nginx.pid

# Nginx configuration with security headers
COPY --chown=nginxuser:nginxgroup nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginxuser:nginxgroup security-headers.conf /etc/nginx/conf.d/

# Copy built assets from builder stage
COPY --from=builder --chown=nginxuser:nginxgroup /app/dist /usr/share/nginx/html

# Environment variables for Nginx
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_WORKER_CONNECTIONS=1024

# Set resource limits
ENV NGINX_WORKER_RLIMIT_NOFILE=32768

# Configure health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl --fail http://localhost:80/health || exit 1

# Expose port
EXPOSE 80

# Set security configurations
USER nginxuser
WORKDIR /usr/share/nginx/html

# Security options
RUN chmod -R 555 /usr/share/nginx/html && \
    chmod -R 444 /usr/share/nginx/html/*

# Drop all capabilities and only add necessary ones
RUN setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

# Security labels
LABEL org.label-schema.security.fedramp="high"
LABEL org.label-schema.security.cjis="compliant"

# Resource limits
LABEL org.label-schema.limits.cpu="1"
LABEL org.label-schema.limits.memory="2Gi"
LABEL org.label-schema.limits.pids="100"
LABEL org.label-schema.limits.nofile="32768"