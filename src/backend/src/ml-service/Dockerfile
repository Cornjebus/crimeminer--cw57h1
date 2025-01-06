# Stage 1: Security Scanner
FROM aquasec/trivy:latest AS security-scanner
WORKDIR /scan

# Copy dependency files for scanning
COPY requirements.txt package.json ./

# Scan base images
RUN trivy image python:3.11-slim && \
    trivy image node:18-slim && \
    trivy image nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Scan dependencies
RUN trivy fs --security-checks vuln,config,secret .

# Stage 2: Node.js Builder
FROM node:18-slim AS builder
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Security audit and install dependencies
RUN npm audit && \
    npm ci --only=production && \
    npm cache clean --force

# Copy source and build
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Stage 3: Python Dependencies
FROM python:3.11-slim AS python-deps
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 4: Final Runtime Image
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Security patches and dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    nodejs \
    npm \
    curl \
    ca-certificates \
    gnupg \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r mlservice && \
    useradd -r -g mlservice -s /sbin/nologin mlservice && \
    mkdir -p /usr/src/app && \
    chown mlservice:mlservice /usr/src/app

WORKDIR /usr/src/app

# Copy built artifacts and dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Set secure permissions
RUN chown -R mlservice:mlservice /usr/src/app && \
    chmod -R 550 /usr/src/app

# Environment variables
ENV NODE_ENV=production \
    PYTHON_ENV=production \
    PORT=3000 \
    CUDA_VISIBLE_DEVICES=all \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    PYTHONUNBUFFERED=1 \
    NODE_OPTIONS="--max-old-space-size=32768"

# Resource limits
ENV MALLOC_ARENA_MAX=2 \
    MALLOC_TRIM_THRESHOLD_=131072

# Security configurations
RUN echo "kernel.unprivileged_userns_clone=0" >> /etc/sysctl.conf && \
    echo "kernel.core_pattern=|/bin/false" >> /etc/sysctl.conf && \
    echo "net.ipv4.conf.all.accept_redirects=0" >> /etc/sysctl.conf

# Expose ports
EXPOSE 3000 3001

# Switch to non-root user
USER mlservice

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set resource limits
LABEL com.nvidia.volumes.needed="nvidia_driver"
LABEL gpu.memory.limit="16g"
LABEL cpu.limit="32"
LABEL memory.limit="64g"
LABEL pids.limit="1000"

# Start command
CMD ["node", "dist/main"]