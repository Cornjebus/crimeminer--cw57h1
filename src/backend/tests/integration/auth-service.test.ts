/**
 * @file Integration tests for CrimeMiner authentication service
 * @version 1.0.0
 * @description Validates FedRAMP High and CJIS compliant authentication flows
 * with comprehensive security testing and compliance validation
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'; // v29.0.0
import supertest from 'supertest'; // v6.3.3
import { Keycloak as MockKeycloak } from 'keycloak-connect'; // v21.0.0
import Redis from 'ioredis-mock'; // v8.9.0
import { AuditLogger } from '@company/audit-logger'; // v1.0.0

import { AuthService } from '../../src/auth-service/src/services/auth.service';
import { AuthValidator } from '../../src/auth-service/src/validators/auth.validator';
import { AuthErrorCodes, SecurityErrorCodes } from '../../src/common/constants/error-codes';
import { IAuthRequest, IMfaRequest } from '../../src/auth-service/src/interfaces/auth.interface';
import { ErrorSeverity } from '../../src/common/interfaces/base.interface';

// Test security context
const TEST_SECURITY_CONTEXT = {
  clearanceLevel: 'TOP_SECRET',
  compartments: ['TS_SCI'],
  caveats: ['HCS']
};

// FedRAMP compliance configuration
const COMPLIANCE_CONFIG = {
  fedRampLevel: 'HIGH',
  cjisVersion: '5.9',
  auditRetention: '7years'
};

describe('AuthService Integration Tests', () => {
  let authService: AuthService;
  let mockKeycloak: jest.Mocked<MockKeycloak>;
  let mockRedis: Redis;
  let mockAuditLogger: jest.Mocked<AuditLogger>;
  let validator: AuthValidator;

  beforeAll(async () => {
    // Initialize mock dependencies with security controls
    mockKeycloak = new MockKeycloak({
      realm: 'crimeminer',
      'auth-server-url': 'https://auth.crimeminer.gov',
      'ssl-required': 'external',
      'confidential-port': 8443
    });

    mockRedis = new Redis({
      keyPrefix: 'test:',
      enableAutoPipelining: true,
      lazyConnect: true
    });

    mockAuditLogger = {
      logSecurityEvent: jest.fn(),
      logAuthEvent: jest.fn(),
      logValidationEvent: jest.fn()
    } as any;

    validator = new AuthValidator();

    // Initialize auth service with mocked dependencies
    authService = new AuthService(
      mockKeycloak,
      mockRedis,
      validator
    );

    // Configure mock behaviors
    mockKeycloak.grantManager = {
      obtainDirectly: jest.fn(),
      validateToken: jest.fn(),
      createGrant: jest.fn()
    } as any;
  });

  afterAll(async () => {
    await mockRedis.quit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should enforce FedRAMP authentication requirements', async () => {
    // Prepare test request with FedRAMP compliant credentials
    const authRequest: IAuthRequest = {
      requestId: 'TEST-001',
      timestamp: new Date(),
      userId: 'test-user',
      sessionId: 'test-session',
      username: 'test.user@agency.gov',
      password: 'SecureP@ssw0rd123!',
      clientInfo: {
        userAgent: 'Test Browser 1.0',
        ipAddress: '10.0.0.1',
        deviceId: 'TEST-DEVICE-001',
        securityClearance: 'TOP_SECRET'
      }
    };

    // Mock successful Keycloak authentication
    mockKeycloak.grantManager.obtainDirectly.mockResolvedValueOnce({
      access_token: {
        token: 'valid-token',
        content: {
          sub: 'test-user',
          exp: Math.floor(Date.now() / 1000) + 900,
          session_state: 'test-session'
        }
      }
    });

    const response = await authService.authenticate(authRequest);

    // Verify FedRAMP compliance
    expect(response.success).toBe(true);
    expect(mockAuditLogger.logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTHENTICATE',
        userId: 'test-user',
        clearanceLevel: 'TOP_SECRET'
      })
    );
  });

  test('should enforce MFA requirements for high clearance access', async () => {
    const authRequest: IAuthRequest = {
      requestId: 'TEST-002',
      timestamp: new Date(),
      userId: 'test-user',
      sessionId: 'test-session',
      username: 'test.user@agency.gov',
      password: 'SecureP@ssw0rd123!',
      clientInfo: {
        userAgent: 'Test Browser 1.0',
        ipAddress: '10.0.0.1',
        deviceId: 'TEST-DEVICE-001',
        securityClearance: 'TOP_SECRET'
      }
    };

    // Mock MFA required response
    mockKeycloak.grantManager.obtainDirectly.mockResolvedValueOnce({
      access_token: {
        token: 'temp-token',
        content: {
          sub: 'test-user',
          mfa_required: true
        }
      }
    });

    const response = await authService.authenticate(authRequest);

    expect(response.success).toBe(true);
    expect(response.mfaRequired).toBe(true);
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MFA_REQUIRED',
        clearanceLevel: 'TOP_SECRET'
      })
    );
  });

  test('should validate MFA verification with CJIS compliance', async () => {
    const mfaRequest: IMfaRequest = {
      requestId: 'TEST-003',
      timestamp: new Date(),
      userId: 'test-user',
      sessionId: 'test-session',
      mfaCode: '123456',
      tempToken: 'valid-temp-token',
      clientInfo: {
        userAgent: 'Test Browser 1.0',
        ipAddress: '10.0.0.1',
        deviceId: 'TEST-DEVICE-001',
        securityClearance: 'TOP_SECRET'
      }
    };

    // Mock successful MFA verification
    await mockRedis.set(
      'auth:mfa:valid-temp-token',
      JSON.stringify({
        userId: 'test-user',
        mfaType: 'totp',
        sessionId: 'test-session'
      })
    );

    const response = await authService.verifyMfa(mfaRequest);

    expect(response.success).toBe(true);
    expect(response.mfaRequired).toBe(false);
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MFA_SUCCESS',
        userId: 'test-user'
      })
    );
  });

  test('should enforce security clearance validation', async () => {
    const authRequest: IAuthRequest = {
      requestId: 'TEST-004',
      timestamp: new Date(),
      userId: 'test-user',
      sessionId: 'test-session',
      username: 'test.user@agency.gov',
      password: 'SecureP@ssw0rd123!',
      clientInfo: {
        userAgent: 'Test Browser 1.0',
        ipAddress: '10.0.0.1',
        deviceId: 'TEST-DEVICE-001',
        securityClearance: 'SECRET'
      }
    };

    // Mock insufficient clearance
    mockKeycloak.grantManager.obtainDirectly.mockResolvedValueOnce({
      access_token: {
        token: 'valid-token',
        content: {
          sub: 'test-user',
          clearance: 'SECRET'
        }
      }
    });

    const response = await authService.authenticate(authRequest);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(AuthErrorCodes.INSUFFICIENT_CLEARANCE);
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CLEARANCE_VALIDATION_FAILED',
        severity: ErrorSeverity.ERROR
      })
    );
  });

  test('should handle token refresh with security validation', async () => {
    // Mock valid refresh token
    const refreshToken = 'valid-refresh-token';
    
    mockKeycloak.grantManager.createGrant.mockResolvedValueOnce({
      access_token: {
        token: 'new-access-token',
        content: {
          sub: 'test-user',
          exp: Math.floor(Date.now() / 1000) + 900,
          session_state: 'test-session'
        }
      },
      refresh_token: {
        token: 'new-refresh-token'
      }
    });

    const response = await authService.refreshToken(refreshToken);

    expect(response.success).toBe(true);
    expect(response).toHaveProperty('accessToken');
    expect(response).toHaveProperty('refreshToken');
    expect(mockAuditLogger.logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TOKEN_REFRESH',
        userId: 'test-user'
      })
    );
  });

  test('should prevent authentication with revoked tokens', async () => {
    const revokedToken = 'revoked-token';
    
    // Add token to blacklist
    await mockRedis.set(
      `auth:blacklist:${revokedToken}`,
      'revoked',
      'EX',
      900
    );

    const response = await authService.refreshToken(revokedToken);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(AuthErrorCodes.INVALID_TOKEN);
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TOKEN_REVOKED_ACCESS_ATTEMPT',
        severity: ErrorSeverity.WARNING
      })
    );
  });

  test('should enforce password complexity requirements', async () => {
    const authRequest: IAuthRequest = {
      requestId: 'TEST-005',
      timestamp: new Date(),
      userId: 'test-user',
      sessionId: 'test-session',
      username: 'test.user@agency.gov',
      password: 'weak', // Non-compliant password
      clientInfo: {
        userAgent: 'Test Browser 1.0',
        ipAddress: '10.0.0.1',
        deviceId: 'TEST-DEVICE-001',
        securityClearance: 'TOP_SECRET'
      }
    };

    const response = await authService.authenticate(authRequest);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(SecurityErrorCodes.ENCRYPTION_FAILED);
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PASSWORD_COMPLEXITY_FAILURE',
        severity: ErrorSeverity.WARNING
      })
    );
  });
});