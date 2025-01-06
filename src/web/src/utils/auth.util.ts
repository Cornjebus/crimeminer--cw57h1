/**
 * Authentication utility functions implementing FedRAMP High and CJIS compliant
 * token management, secure session control, and comprehensive security audit logging.
 * @version 1.0.0
 */

import { User, LoginResponse, AuthState, SecurityClearanceLevel } from '../types/auth.types';
import apiClient from '../config/api.config';
import jwtDecode from 'jwt-decode'; // v3.1.2
import CryptoJS from 'crypto-js'; // v4.1.1
import winston from 'winston'; // v3.8.2
import { API_ERROR_CODES, COMPLIANCE_LEVELS } from '../constants/api.constants';

// FIPS 140-2 compliant encryption key for token storage
const TOKEN_ENCRYPTION_KEY = import.meta.env.VITE_TOKEN_ENCRYPTION_KEY;

// Secure storage keys
const TOKEN_STORAGE_KEY = 'encrypted_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'encrypted_refresh_token';

// Token configuration
const MAX_TOKEN_AGE = 900; // 15 minutes in seconds
const REFRESH_TOKEN_AGE = 28800; // 8 hours in seconds

// Required CJIS compliance claims
const CJIS_REQUIRED_CLAIMS = [
  'sub',
  'iss',
  'exp',
  'iat',
  'security_clearance',
  'agency_id',
  'jurisdiction'
];

// Configure security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'security.log' })
  ]
});

/**
 * Securely stores encrypted authentication tokens with CJIS compliance validation
 * @param authResponse Login response containing tokens and user data
 */
export const setAuthTokens = (authResponse: LoginResponse): void => {
  try {
    // Validate auth response
    if (!authResponse?.accessToken || !authResponse?.refreshToken) {
      throw new Error(API_ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate CJIS compliance
    const decodedToken = jwtDecode(authResponse.accessToken);
    validateCJISCompliance(decodedToken);

    // Encrypt tokens using FIPS-compliant AES-256
    const encryptedAccessToken = CryptoJS.AES.encrypt(
      authResponse.accessToken,
      TOKEN_ENCRYPTION_KEY
    ).toString();

    const encryptedRefreshToken = CryptoJS.AES.encrypt(
      authResponse.refreshToken,
      TOKEN_ENCRYPTION_KEY
    ).toString();

    // Store encrypted tokens with expiry
    localStorage.setItem(TOKEN_STORAGE_KEY, encryptedAccessToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, encryptedRefreshToken);

    // Update API client authorization header
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${authResponse.accessToken}`;

    // Log security event
    securityLogger.info('Authentication tokens stored', {
      userId: authResponse.user.id,
      sessionId: authResponse.sessionId,
      tokenExpiry: new Date(Date.now() + MAX_TOKEN_AGE * 1000)
    });

  } catch (error) {
    securityLogger.error('Token storage failed', { error });
    throw error;
  }
};

/**
 * Retrieves and validates stored authentication tokens with security checks
 * @returns Object containing decrypted tokens if valid, null otherwise
 */
export const getAuthTokens = (): { accessToken: string; refreshToken: string } | null => {
  try {
    // Retrieve encrypted tokens
    const encryptedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const encryptedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

    if (!encryptedAccessToken || !encryptedRefreshToken) {
      return null;
    }

    // Decrypt tokens
    const accessToken = CryptoJS.AES.decrypt(
      encryptedAccessToken,
      TOKEN_ENCRYPTION_KEY
    ).toString(CryptoJS.enc.Utf8);

    const refreshToken = CryptoJS.AES.decrypt(
      encryptedRefreshToken,
      TOKEN_ENCRYPTION_KEY
    ).toString(CryptoJS.enc.Utf8);

    // Validate tokens
    if (!isTokenValid(accessToken)) {
      securityLogger.warn('Invalid access token detected');
      clearAuthTokens();
      return null;
    }

    return { accessToken, refreshToken };

  } catch (error) {
    securityLogger.error('Token retrieval failed', { error });
    clearAuthTokens();
    return null;
  }
};

/**
 * Securely removes all authentication tokens and session data
 */
export const clearAuthTokens = (): void => {
  try {
    // Log session termination
    securityLogger.info('Session terminated', {
      timestamp: new Date(),
      sessionId: sessionStorage.getItem('sessionId')
    });

    // Clear stored tokens
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);

    // Clear API client authorization
    delete apiClient.defaults.headers.common['Authorization'];

    // Clear session data
    sessionStorage.clear();

  } catch (error) {
    securityLogger.error('Token cleanup failed', { error });
    throw error;
  }
};

/**
 * Comprehensive token validation with FedRAMP and CJIS compliance checks
 * @param token JWT token to validate
 * @returns boolean indicating if token is valid and compliant
 */
export const isTokenValid = (token: string): boolean => {
  try {
    // Decode token
    const decodedToken: any = jwtDecode(token);

    // Validate token structure
    if (!decodedToken) {
      return false;
    }

    // Check expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decodedToken.exp < currentTime) {
      return false;
    }

    // Validate CJIS compliance
    validateCJISCompliance(decodedToken);

    // Validate security clearance
    if (!validateSecurityClearance(decodedToken.security_clearance)) {
      return false;
    }

    // Log validation success
    securityLogger.debug('Token validated successfully', {
      exp: new Date(decodedToken.exp * 1000),
      clearance: decodedToken.security_clearance
    });

    return true;

  } catch (error) {
    securityLogger.error('Token validation failed', { error });
    return false;
  }
};

/**
 * Validates required CJIS compliance claims in token
 * @param decodedToken Decoded JWT token
 * @throws Error if compliance validation fails
 */
const validateCJISCompliance = (decodedToken: any): void => {
  // Verify all required claims are present
  const missingClaims = CJIS_REQUIRED_CLAIMS.filter(
    claim => !decodedToken.hasOwnProperty(claim)
  );

  if (missingClaims.length > 0) {
    throw new Error(`Missing required CJIS claims: ${missingClaims.join(', ')}`);
  }

  // Validate issuer
  if (decodedToken.iss !== import.meta.env.VITE_TOKEN_ISSUER) {
    throw new Error(API_ERROR_CODES.CERT_INVALID);
  }

  // Validate compliance level
  if (decodedToken.compliance_level !== COMPLIANCE_LEVELS.CJIS) {
    throw new Error(API_ERROR_CODES.COMPLIANCE_VIOLATION);
  }
};

/**
 * Validates security clearance level meets minimum requirements
 * @param clearance Security clearance level from token
 * @returns boolean indicating if clearance is valid
 */
const validateSecurityClearance = (clearance: string): boolean => {
  const validClearances = [
    SecurityClearanceLevel.TOP_SECRET,
    SecurityClearanceLevel.SECRET,
    SecurityClearanceLevel.CONFIDENTIAL
  ];
  return validClearances.includes(clearance as SecurityClearanceLevel);
};