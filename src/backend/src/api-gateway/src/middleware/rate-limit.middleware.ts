/**
 * @file Rate limiting middleware for API Gateway
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant rate limiting with distributed counters
 */

import Redis from 'ioredis'; // v5.3.0
import { Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import { IBaseResponse } from '../../../common/interfaces/base.interface';
import { SystemErrorCodes } from '../../../common/constants/error-codes';
import crypto from 'crypto';

// Constants for rate limiting tiers per technical specifications
const RATE_LIMIT_TIERS = {
  AUTH: { windowMs: 60 * 1000, maxRequests: 10 }, // 10/minute
  EVIDENCE_UPLOAD: { windowMs: 60 * 60 * 1000, maxRequests: 100 }, // 100/hour
  SEARCH: { windowMs: 60 * 60 * 1000, maxRequests: 1000 }, // 1000/hour
  DEFAULT: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 10000 }, // 10000/day
} as const;

// FedRAMP and CJIS compliant security headers
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'X-Rate-Limit-Policy': 'FedRAMP-High',
};

// Redis key prefixes for rate limiting
const REDIS_KEY_PREFIX = 'ratelimit:';
const AUDIT_KEY_PREFIX = 'ratelimit-audit:';

/**
 * Rate limit configuration options interface
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  enableAudit?: boolean;
  securityHeaders?: Record<string, string>;
  redisOptions?: Redis.RedisOptions;
}

/**
 * Rate limit information interface for response headers
 */
interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  requestId: string;
  auditToken: string;
}

/**
 * Creates a cryptographically secure rate limit key
 */
const getRateLimitKey = (req: Request, prefix: string): string => {
  const clientIp = req.ip || 
    req.headers['x-forwarded-for'] as string || 
    req.socket.remoteAddress || 
    'unknown';
    
  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const endpoint = req.path;
  
  // Create HMAC of client identifiers
  const hmac = crypto.createHmac('sha256', process.env.RATE_LIMIT_SECRET || 'default-secret');
  hmac.update(`${clientIp}:${userId}:${endpoint}`);
  
  return `${prefix}${hmac.digest('hex')}`;
};

/**
 * Determines the appropriate rate limit tier for a request
 */
const getRateLimitTier = (req: Request) => {
  if (req.path.includes('/auth')) {
    return RATE_LIMIT_TIERS.AUTH;
  }
  if (req.path.includes('/evidence/upload')) {
    return RATE_LIMIT_TIERS.EVIDENCE_UPLOAD;
  }
  if (req.path.includes('/search')) {
    return RATE_LIMIT_TIERS.SEARCH;
  }
  return RATE_LIMIT_TIERS.DEFAULT;
};

/**
 * Rate limiting middleware factory function
 */
export const rateLimitMiddleware = (options: Partial<RateLimitOptions> = {}) => {
  // Initialize Redis client with high availability configuration
  const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    ...options.redisOptions,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Apply security headers
      Object.entries({ ...SECURITY_HEADERS, ...options.securityHeaders })
        .forEach(([key, value]) => res.setHeader(key, value));

      // Get appropriate rate limit tier
      const tier = getRateLimitTier(req);
      const windowMs = options.windowMs || tier.windowMs;
      const maxRequests = options.maxRequests || tier.maxRequests;

      // Generate rate limit key
      const keyPrefix = options.keyPrefix || REDIS_KEY_PREFIX;
      const key = getRateLimitKey(req, keyPrefix);

      // Check current request count with distributed locking
      const multi = redisClient.multi();
      multi.incr(key);
      multi.pttl(key);
      
      const [current, ttl] = await multi.exec() as [number, number][];
      
      // Set expiry on first request
      if (current === 1) {
        await redisClient.pexpire(key, windowMs);
      }

      // Calculate rate limit info
      const resetTime = ttl === -1 ? Date.now() + windowMs : Date.now() + ttl;
      const remaining = Math.max(0, maxRequests - current);
      const requestId = crypto.randomUUID();

      // Prepare rate limit headers
      const rateLimitInfo: RateLimitInfo = {
        limit: maxRequests,
        current: current,
        remaining: remaining,
        resetTime: resetTime,
        requestId: requestId,
        auditToken: crypto.randomBytes(16).toString('hex')
      };

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);
      res.setHeader('X-Request-ID', requestId);

      // Audit logging for FedRAMP compliance
      if (options.enableAudit) {
        const auditKey = `${AUDIT_KEY_PREFIX}${requestId}`;
        await redisClient.setex(auditKey, 86400, JSON.stringify({
          timestamp: Date.now(),
          clientIp: req.ip,
          userId: req.headers['x-user-id'],
          endpoint: req.path,
          rateLimitInfo
        }));
      }

      // Return 429 if limit exceeded
      if (current > maxRequests) {
        const response: IBaseResponse = {
          success: false,
          requestId: requestId,
          timestamp: new Date(),
          processingTime: 0,
          auditToken: rateLimitInfo.auditToken,
          error: {
            code: SystemErrorCodes.RATE_LIMIT_EXCEEDED,
            message: 'Rate limit exceeded. Please reduce request frequency.',
            retryAfter: Math.ceil(ttl / 1000)
          }
        };
        
        res.setHeader('Retry-After', Math.ceil(ttl / 1000));
        return res.status(429).json(response);
      }

      next();
    } catch (error) {
      // Handle errors with FedRAMP compliant logging
      console.error('Rate limit error:', error);
      next(error);
    }
  };
};

export default rateLimitMiddleware;