/**
 * @file Error handling middleware for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant error handling with standardized
 * error responses, logging, security measures, and SIEM integration
 */

import { ErrorRequestHandler, Request, Response, NextFunction } from 'express'; // v4.18.2
import crypto from 'crypto';
import { SystemErrorCodes } from '../constants/error-codes';
import { Logger } from '../utils/logger.util';
import { 
  ErrorSeverity, 
  IErrorResponse, 
  IClientInfo,
  IErrorDetails 
} from '../interfaces/base.interface';

// Initialize secure logger with SIEM integration
const logger = new Logger('ErrorHandler', {
  level: 'error',
  syslogHost: process.env.SIEM_HOST,
  syslogPort: parseInt(process.env.SIEM_PORT || '514'),
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});

// Initialize response signer for integrity verification
const errorResponseSigner = crypto.createSign('SHA512');

/**
 * Extract client security context from request
 */
const extractSecurityContext = (req: Request): IClientInfo => {
  return {
    userAgent: req.headers['user-agent'] || 'unknown',
    ipAddress: req.ip,
    deviceId: req.headers['x-device-id'] as string,
    geoLocation: {
      latitude: parseFloat(req.headers['x-geo-lat'] as string),
      longitude: parseFloat(req.headers['x-geo-long'] as string)
    },
    securityClearance: req.headers['x-security-clearance'] as string
  };
};

/**
 * Classify error severity based on error type and impact
 */
const classifyErrorSeverity = (error: Error): ErrorSeverity => {
  if (error.name === 'SecurityError' || error.name === 'AuthenticationError') {
    return ErrorSeverity.CRITICAL;
  }
  if (error.name === 'ValidationError') {
    return ErrorSeverity.WARNING;
  }
  return ErrorSeverity.ERROR;
};

/**
 * Sanitize error details to prevent sensitive data exposure
 */
const sanitizeErrorDetails = (error: Error): IErrorDetails => {
  return {
    code: (error as any).code || SystemErrorCodes.INTERNAL_SERVER_ERROR,
    message: error.message.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[REDACTED_EMAIL]')
            .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[REDACTED_CARD]')
            .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[REDACTED_SSN]'),
    details: {},
    source: error.name,
    timestamp: new Date(),
    stackTrace: process.env.NODE_ENV === 'production' ? '' : error.stack || ''
  };
};

/**
 * Sign error response for integrity verification
 */
const signErrorResponse = (response: IErrorResponse): string => {
  errorResponseSigner.update(JSON.stringify(response));
  return errorResponseSigner.sign(process.env.ERROR_SIGNING_KEY || 'default-key', 'base64');
};

/**
 * Set security headers for error response
 */
const setSecurityHeaders = (res: Response): void => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });
};

/**
 * FedRAMP and CJIS compliant error handling middleware
 */
export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Generate unique error correlation ID
    const incidentId = crypto.randomBytes(16).toString('hex');
    
    // Extract security context
    const clientInfo = extractSecurityContext(req);
    
    // Classify error severity
    const severity = classifyErrorSeverity(error);
    
    // Sanitize error details
    const sanitizedError = sanitizeErrorDetails(error);
    
    // Construct standardized error response
    const errorResponse: IErrorResponse = {
      success: false,
      requestId: req.headers['x-request-id'] as string,
      timestamp: new Date(),
      processingTime: Date.now() - (req.startTime || Date.now()),
      error: sanitizedError,
      incidentId,
      severity,
      auditToken: ''
    };
    
    // Sign response for integrity verification
    errorResponse.auditToken = signErrorResponse(errorResponse);
    
    // Log error with security context to SIEM
    logger.error('Request error occurred', error, {
      requestId: errorResponse.requestId,
      userId: req.user?.id || 'anonymous',
      sessionId: req.sessionID || 'none',
      sourceIp: clientInfo.ipAddress,
      incidentId,
      severity,
      clientInfo
    });
    
    // Set security headers
    setSecurityHeaders(res);
    
    // Send secured error response
    res.status(error.name === 'ValidationError' ? 400 : 500)
       .json(errorResponse);
    
  } catch (handlerError) {
    // Fallback error handling for handler failures
    logger.error('Error handler failed', handlerError as Error, {
      requestId: req.headers['x-request-id'] as string,
      userId: 'system',
      sessionId: 'none',
      sourceIp: req.ip,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: SystemErrorCodes.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred'
      }
    });
  }
};