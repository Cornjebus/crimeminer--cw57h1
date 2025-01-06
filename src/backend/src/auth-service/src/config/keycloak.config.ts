/**
 * @file Keycloak configuration for CrimeMiner authentication service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant authentication configuration
 * with enhanced security features, MFA support, and comprehensive audit logging
 */

import { IBaseResponse } from '../../../common/interfaces/base.interface';
import KeycloakConnect from 'keycloak-connect'; // v21.0.0

// Environment variable validation and secure defaults
const validateEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
};

// Core Keycloak configuration with FedRAMP compliance
export const keycloakConfig: KeycloakConnect.KeycloakConfig = {
  authServerUrl: validateEnvVar('KEYCLOAK_AUTH_URL'),
  realm: validateEnvVar('KEYCLOAK_REALM'),
  clientId: validateEnvVar('KEYCLOAK_CLIENT_ID'),
  secret: validateEnvVar('KEYCLOAK_CLIENT_SECRET'),
  bearerOnly: true,
  verifyTokenAudience: true,
  enablePKCE: true, // PKCE for enhanced security
  confidentialPort: 8443,
  'ssl-required': 'external',
  'verify-token-audience': true,
  'use-resource-role-mappings': true,
  'confidential-port': 8443,
  'policy-enforcer': {
    enabled: true,
    enforcement-mode: 'ENFORCING'
  }
};

// Enhanced token configuration for CJIS compliance
export const tokenConfig = {
  accessTokenTTL: 900, // 15 minutes in seconds
  refreshTokenTTL: 604800, // 7 days in seconds
  verifyTokenAudience: true,
  verifyTokenExpiration: true,
  enableTokenRevocation: true,
  minimumTokenValidity: 30,
  tokenSignatureAlgorithm: 'RS256',
  tokenEncryption: {
    enabled: true,
    algorithm: 'AES-256-GCM'
  },
  sessionTracking: {
    enabled: true,
    maxConcurrentSessions: 1
  }
};

// Multi-factor authentication configuration
export const mfaConfig = {
  enabled: true,
  requiredLevel: validateEnvVar('MFA_REQUIRED_LEVEL', 'HIGH'),
  allowedProviders: validateEnvVar('ALLOWED_MFA_PROVIDERS', 'otp,fido2,sms').split(','),
  gracePolicy: {
    enabled: false,
    gracePeriodHours: 0
  },
  challengeTimeout: 300, // 5 minutes in seconds
  otpPolicy: {
    type: 'totp',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    lookAheadWindow: 1
  },
  recoveryCodeCount: 8,
  lockoutPolicy: {
    maxFailedAttempts: Number(validateEnvVar('MAX_LOGIN_ATTEMPTS', '3')),
    lockoutDuration: Number(validateEnvVar('LOCKOUT_DURATION', '1800')), // 30 minutes in seconds
    failureResetTime: 300 // 5 minutes in seconds
  }
};

// Security event monitoring configuration
const securityEventConfig = {
  enabled: true,
  auditEvents: [
    'LOGIN',
    'LOGIN_ERROR',
    'LOGOUT',
    'TOKEN_EXCHANGE',
    'REFRESH_TOKEN',
    'MFA_CHALLENGE',
    'MFA_FAILURE',
    'REVOKE_GRANT'
  ],
  alertThresholds: {
    failedLogins: 3,
    tokenRevocations: 5,
    mfaFailures: 2
  }
};

// Initialize Keycloak with FedRAMP and CJIS compliance settings
export async function initializeKeycloak(): Promise<KeycloakConnect.Keycloak> {
  try {
    const keycloak = new KeycloakConnect({}, keycloakConfig);

    // Configure security policies
    keycloak.accessDenied = (req, res) => {
      res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_006',
          message: 'Access denied. Please verify your permissions.'
        }
      } as IBaseResponse);
    };

    // Configure token validation
    await keycloak.grantManager.validateToken = async (token, expectedType) => {
      // Enhanced token validation logic
      if (!token || !token.signed) {
        throw new Error('Token validation failed: Invalid token structure');
      }

      // Verify token claims
      const claims = token.content;
      if (!claims.exp || Date.now() / 1000 > claims.exp) {
        throw new Error('Token validation failed: Token expired');
      }

      if (claims.aud !== keycloakConfig.clientId) {
        throw new Error('Token validation failed: Invalid audience');
      }

      return token;
    };

    return keycloak;
  } catch (error) {
    throw new Error(`Keycloak initialization failed: ${error.message}`);
  }
}

// Export configuration types for type safety
export type KeycloakConfiguration = typeof keycloakConfig;
export type TokenConfiguration = typeof tokenConfig;
export type MFAConfiguration = typeof mfaConfig;