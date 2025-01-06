/**
 * @file MFA verification middleware for CrimeMiner auth service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant MFA verification with enhanced
 * security controls, audit logging, and session encryption
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import Redis from 'ioredis'; // v5.3.2
import speakeasy from 'speakeasy'; // v2.0.0
import crypto from 'crypto'; // native
import rateLimit from 'express-rate-limit'; // v6.9.0
import winston from 'winston'; // v3.10.0
import { IMfaRequest, IAuthResponse } from '../interfaces/auth.interface';
import { errorHandler } from '../../../common/middleware/error-handler.middleware';
import { AuthErrorCodes } from '../../../common/constants/error-codes';

// Initialize Redis client with TLS
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: {
    rejectUnauthorized: true
  }
});

// Initialize secure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/mfa-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/mfa-combined.log' })
  ]
});

// Constants
const MFA_CODE_EXPIRES = 300; // 5 minutes
const MFA_CODE_LENGTH = 6;
const MFA_SESSION_PREFIX = 'auth:mfa:';
const MFA_MAX_ATTEMPTS = 3;
const MFA_LOCKOUT_TIME = 900; // 15 minutes
const MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY;

// Rate limiting middleware
const mfaRateLimiter = rateLimit({
  windowMs: MFA_LOCKOUT_TIME * 1000,
  max: MFA_MAX_ATTEMPTS,
  message: { error: AuthErrorCodes.ACCESS_DENIED, message: 'Too many MFA attempts' }
});

/**
 * Encrypts MFA session data with integrity protection
 */
async function encryptSession(sessionData: any): Promise<string> {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(MFA_ENCRYPTION_KEY!, 'base64'), iv);
  
  let encrypted = cipher.update(JSON.stringify(sessionData), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  const hmac = crypto.createHmac('sha256', MFA_ENCRYPTION_KEY!);
  hmac.update(encrypted + iv.toString('base64'));
  
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    tag: authTag.toString('base64'),
    hmac: hmac.digest('base64')
  });
}

/**
 * Validates MFA session with integrity checks
 */
async function validateMFASession(tempToken: string, userId: string): Promise<boolean> {
  try {
    const sessionKey = `${MFA_SESSION_PREFIX}${userId}`;
    const encryptedSession = await redis.get(sessionKey);
    
    if (!encryptedSession) {
      return false;
    }

    const session = JSON.parse(encryptedSession);
    const hmac = crypto.createHmac('sha256', MFA_ENCRYPTION_KEY!);
    hmac.update(session.data + session.iv);
    
    if (hmac.digest('base64') !== session.hmac) {
      logger.error('MFA session integrity check failed', {
        userId,
        sessionKey,
        timestamp: new Date().toISOString()
      });
      return false;
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(MFA_ENCRYPTION_KEY!, 'base64'),
      Buffer.from(session.iv, 'base64')
    );
    
    decipher.setAuthTag(Buffer.from(session.tag, 'base64'));
    
    const decrypted = decipher.update(session.data, 'base64', 'utf8') + 
                     decipher.final('utf8');
    
    const sessionData = JSON.parse(decrypted);
    return sessionData.tempToken === tempToken;
  } catch (error) {
    logger.error('MFA session validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

/**
 * FedRAMP and CJIS compliant MFA verification middleware
 */
export const verifyMFACode = [
  mfaRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mfaCode, tempToken, mfaType } = req.body as IMfaRequest;
      const userId = req.user?.id;

      // Validate input
      if (!mfaCode || !tempToken || !userId || !mfaType) {
        throw new Error(AuthErrorCodes.INVALID_TOKEN);
      }

      if (mfaCode.length !== MFA_CODE_LENGTH) {
        throw new Error(AuthErrorCodes.INVALID_TOKEN);
      }

      // Validate session
      const isValidSession = await validateMFASession(tempToken, userId);
      if (!isValidSession) {
        throw new Error(AuthErrorCodes.SESSION_EXPIRED);
      }

      // Verify MFA code based on type
      let isValidCode = false;
      switch (mfaType) {
        case 'totp':
          isValidCode = speakeasy.totp.verify({
            secret: process.env.MFA_SECRET!,
            encoding: 'base32',
            token: mfaCode,
            window: 1
          });
          break;
        // Add other MFA type verifications here
        default:
          throw new Error(AuthErrorCodes.INVALID_TOKEN);
      }

      if (!isValidCode) {
        throw new Error(AuthErrorCodes.INVALID_TOKEN);
      }

      // Clear MFA session after successful verification
      await redis.del(`${MFA_SESSION_PREFIX}${userId}`);

      // Set security headers
      res.set({
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });

      // Attach verification result to request
      (req as any).mfaVerified = true;

      // Log successful verification
      logger.info('MFA verification successful', {
        userId,
        mfaType,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      next();
    } catch (error) {
      logger.error('MFA verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
      errorHandler(error as Error, req, res, next);
    }
  }
];

export { validateMFASession };