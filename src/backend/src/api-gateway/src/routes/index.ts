/**
 * @file API Gateway routing configuration for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant routing with comprehensive security controls
 */

import express, { Router, Request, Response, NextFunction } from 'express'; // v4.18.2
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware'; // v2.0.6
import helmet from 'helmet'; // v7.0.0
import { withId as correlationId } from 'correlation-id'; // v4.0.0
import { auditLogMiddleware } from '@company/audit-log-middleware'; // v1.0.0
import CircuitBreaker from 'opossum'; // v6.0.0

import { authMiddleware, AuthOptions } from '../middleware/auth.middleware';
import { rateLimitMiddleware, RateLimitOptions } from '../middleware/rate-limit.middleware';
import { IErrorResponse } from '../../../common/interfaces/base.interface';
import { SystemErrorCodes } from '../../../common/constants/error-codes';

// API version and service endpoints
const API_VERSION = '/api/v1';

const SERVICE_ENDPOINTS = {
  auth: process.env.AUTH_SERVICE_URL,
  case: process.env.CASE_SERVICE_URL,
  evidence: process.env.EVIDENCE_SERVICE_URL,
  analysis: process.env.ML_SERVICE_URL,
  search: process.env.SEARCH_SERVICE_URL,
  storage: process.env.STORAGE_SERVICE_URL,
  notification: process.env.NOTIFICATION_SERVICE_URL
};

// FedRAMP and CJIS compliant security configuration
const SECURITY_CONFIG = {
  hsts: true,
  csp: 'strict',
  frameGuard: 'deny',
  xssFilter: true
};

/**
 * Creates a secure proxy middleware with circuit breaker and security controls
 */
const createServiceProxy = (serviceUrl: string, options: ProxyOptions) => {
  const breaker = new CircuitBreaker(createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    secure: true,
    xfwd: true,
    ...options,
    onError: (err: Error, req: Request, res: Response) => {
      const errorResponse: IErrorResponse = {
        success: false,
        error: {
          code: SystemErrorCodes.SERVICE_UNAVAILABLE,
          message: 'Service temporarily unavailable',
          timestamp: new Date(),
          source: 'api-gateway',
          details: {},
          stackTrace: ''
        },
        requestId: req.headers['x-request-id'] as string,
        timestamp: new Date(),
        processingTime: 0,
        auditToken: '',
        incidentId: '',
        severity: 'ERROR'
      };
      res.status(503).json(errorResponse);
    }
  }), {
    timeout: 5000,
    resetTimeout: 30000,
    errorThresholdPercentage: 50
  });

  return breaker.fallback((req: Request, res: Response) => {
    const errorResponse: IErrorResponse = {
      success: false,
      error: {
        code: SystemErrorCodes.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
        timestamp: new Date(),
        source: 'api-gateway',
        details: {},
        stackTrace: ''
      },
      requestId: req.headers['x-request-id'] as string,
      timestamp: new Date(),
      processingTime: 0,
      auditToken: '',
      incidentId: '',
      severity: 'ERROR'
    };
    res.status(503).json(errorResponse);
  });
};

// Initialize router
const router = Router();

// Global middleware
router.use(correlationId());
router.use(helmet(SECURITY_CONFIG));

// Authentication routes
router.use(`${API_VERSION}/auth`,
  rateLimitMiddleware({
    maxRequests: 10,
    windowMs: 60000,
    enableAudit: true
  }),
  auditLogMiddleware,
  createServiceProxy(SERVICE_ENDPOINTS.auth!, {
    pathRewrite: { [`^${API_VERSION}/auth`]: '' }
  })
);

// Case management routes
router.use(`${API_VERSION}/cases`,
  authMiddleware({
    requireMFA: true,
    clearanceLevel: 'CONFIDENTIAL'
  }),
  rateLimitMiddleware({
    maxRequests: 1000,
    windowMs: 3600000,
    enableAudit: true
  }),
  auditLogMiddleware,
  createServiceProxy(SERVICE_ENDPOINTS.case!, {
    pathRewrite: { [`^${API_VERSION}/cases`]: '' }
  })
);

// Evidence processing routes
router.use(`${API_VERSION}/evidence`,
  authMiddleware({
    requireMFA: true,
    clearanceLevel: 'SECRET'
  }),
  rateLimitMiddleware({
    maxRequests: 100,
    windowMs: 3600000,
    enableAudit: true
  }),
  auditLogMiddleware,
  createServiceProxy(SERVICE_ENDPOINTS.evidence!, {
    pathRewrite: { [`^${API_VERSION}/evidence`]: '' }
  })
);

// Analysis routes
router.use(`${API_VERSION}/analysis`,
  authMiddleware({
    requireMFA: true,
    clearanceLevel: 'CONFIDENTIAL'
  }),
  rateLimitMiddleware({
    maxRequests: 500,
    windowMs: 3600000,
    enableAudit: true
  }),
  auditLogMiddleware,
  createServiceProxy(SERVICE_ENDPOINTS.analysis!, {
    pathRewrite: { [`^${API_VERSION}/analysis`]: '' }
  })
);

// Search routes
router.use(`${API_VERSION}/search`,
  authMiddleware({
    requireMFA: true,
    clearanceLevel: 'CONFIDENTIAL'
  }),
  rateLimitMiddleware({
    maxRequests: 1000,
    windowMs: 3600000,
    enableAudit: true
  }),
  auditLogMiddleware,
  createServiceProxy(SERVICE_ENDPOINTS.search!, {
    pathRewrite: { [`^${API_VERSION}/search`]: '' }
  })
);

// Error handling middleware
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const errorResponse: IErrorResponse = {
    success: false,
    error: {
      code: SystemErrorCodes.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      timestamp: new Date(),
      source: 'api-gateway',
      details: {},
      stackTrace: process.env.NODE_ENV === 'development' ? err.stack : ''
    },
    requestId: req.headers['x-request-id'] as string,
    timestamp: new Date(),
    processingTime: 0,
    auditToken: '',
    incidentId: '',
    severity: 'ERROR'
  };
  res.status(500).json(errorResponse);
});

export default router;