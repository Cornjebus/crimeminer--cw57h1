/**
 * @file Authentication middleware for CrimeMiner API Gateway
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant authentication with enhanced security features
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import winston from 'winston';

import { IErrorResponse } from '../../../common/interfaces/base.interface';
import { ITokenPayload } from '../../../auth-service/src/interfaces/auth.interface';
import { AuthErrorCodes } from '../../../common/constants/error-codes';

// Version comments for third-party dependencies
// jsonwebtoken: v9.0.0
// express: v4.18.2
// rate-limiter-flexible: v2.4.1
// winston: v3.8.2

// Environment variables and constants
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '15m';
const MFA_REQUIRED_PATHS = ['/api/v1/cases', '/api/v1/evidence', '/api/v1/admin'];
const CLEARANCE_LEVELS = ['TOP_SECRET', 'SECRET', 'CONFIDENTIAL'];

// Configure security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-middleware' },
  transports: [
    new winston.transports.File({ filename: 'security.log' }),
    new winston.transports.Console()
  ]
});

// Rate limiter for token validation
const tokenValidationLimiter = new RateLimiterMemory({
  points: 10,
  duration: 1,
  blockDuration: 300
});

/**
 * Validates JWT token with enhanced security checks
 * @param token - JWT token to validate
 * @param deviceFingerprint - Device fingerprint for session validation
 * @returns Decoded token payload
 */
export const validateToken = async (
  token: string,
  deviceFingerprint: string
): Promise<ITokenPayload> => {
  try {
    // Verify JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET!) as ITokenPayload;

    // Validate device fingerprint
    if (decoded.deviceFingerprint !== deviceFingerprint) {
      securityLogger.warn('Device fingerprint mismatch', {
        userId: decoded.sub,
        deviceFingerprint
      });
      throw new Error(AuthErrorCodes.INVALID_DEVICE);
    }

    // Validate session context
    if (!decoded.sessionContext || typeof decoded.sessionContext !== 'object') {
      securityLogger.warn('Invalid session context', { userId: decoded.sub });
      throw new Error(AuthErrorCodes.SESSION_INVALID);
    }

    return decoded;
  } catch (error) {
    securityLogger.error('Token validation failed', { error });
    throw error;
  }
};

/**
 * Validates user clearance level for requested resource
 * @param requiredClearance - Required clearance level
 * @param userClearance - User's clearance level
 * @returns Boolean indicating if user has sufficient clearance
 */
const validateClearance = (
  requiredClearance: string,
  userClearance: string
): boolean => {
  const requiredIndex = CLEARANCE_LEVELS.indexOf(requiredClearance);
  const userIndex = CLEARANCE_LEVELS.indexOf(userClearance);
  return userIndex >= 0 && userIndex <= requiredIndex;
};

/**
 * FedRAMP High and CJIS compliant authentication middleware
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Rate limiting check
    try {
      await tokenValidationLimiter.consume(req.ip);
    } catch {
      const error: IErrorResponse = {
        success: false,
        error: {
          code: AuthErrorCodes.INVALID_TOKEN,
          message: 'Rate limit exceeded for token validation',
          timestamp: new Date(),
          source: 'auth.middleware',
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
      res.status(429).json(error);
      return;
    }

    // Extract and validate authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error(AuthErrorCodes.INVALID_TOKEN);
    }

    // Extract device fingerprint
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string;
    if (!deviceFingerprint) {
      throw new Error(AuthErrorCodes.INVALID_DEVICE);
    }

    // Validate token
    const token = authHeader.split(' ')[1];
    const decoded = await validateToken(token, deviceFingerprint);

    // Check MFA requirement for protected paths
    if (MFA_REQUIRED_PATHS.includes(req.path) && !decoded.mfaVerified) {
      securityLogger.warn('MFA required but not verified', {
        userId: decoded.sub,
        path: req.path
      });
      throw new Error(AuthErrorCodes.MFA_REQUIRED);
    }

    // Validate clearance level
    const requiredClearance = req.headers['x-required-clearance'] as string;
    if (requiredClearance && !validateClearance(requiredClearance, decoded.clearanceLevel)) {
      securityLogger.warn('Insufficient clearance', {
        userId: decoded.sub,
        required: requiredClearance,
        actual: decoded.clearanceLevel
      });
      throw new Error(AuthErrorCodes.INSUFFICIENT_CLEARANCE);
    }

    // Attach decoded token to request
    req.user = decoded;

    // Log successful authentication
    securityLogger.info('Authentication successful', {
      userId: decoded.sub,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    const errorResponse: IErrorResponse = {
      success: false,
      error: {
        code: error.message || AuthErrorCodes.INVALID_TOKEN,
        message: 'Authentication failed',
        timestamp: new Date(),
        source: 'auth.middleware',
        details: {},
        stackTrace: process.env.NODE_ENV === 'development' ? error.stack : ''
      },
      requestId: req.headers['x-request-id'] as string,
      timestamp: new Date(),
      processingTime: 0,
      auditToken: '',
      incidentId: '',
      severity: 'ERROR'
    };

    // Log authentication failure
    securityLogger.error('Authentication failed', {
      error: error.message,
      path: req.path,
      ip: req.ip
    });

    res.status(401).json(errorResponse);
  }
};