/**
 * @file Unit tests for CrimeMiner authentication service
 * @version 1.0.0
 * @description Comprehensive test coverage for FedRAMP High and CJIS compliant authentication flows
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'; // v29.0.0
import { MockKeycloak } from 'keycloak-connect'; // v21.0.0
import { MockRedis } from 'ioredis-mock'; // v8.2.2
import { randomBytes } from 'crypto';

import { AuthService } from '../../../src/auth-service/src/services/auth.service';
import { IAuthRequest, IAuthResponse } from '../../../src/auth-service/src/interfaces/auth.interface';
import { AuthErrorCodes, SecurityErrorCodes } from '../../../src/common/constants/error-codes';
import { ErrorSeverity } from '../../../src/common/interfaces/base.interface';

describe('AuthService - FedRAMP High & CJIS Compliance', () => {
  let authService: AuthService;
  let mockKeycloakClient: jest.Mocked<MockKeycloak>;
  let mockRedisClient: jest.Mocked<MockRedis>;
  let mockAuditLogger: jest.SpyInstance;

  // Test data following FedRAMP requirements
  const validRequest: IAuthRequest = {
    requestId: randomBytes(16).toString('hex'),
    timestamp: new Date(),
    username: 'investigator.smith',
    password: 'P@ssw0rd123!SecureComplex',
    userId: 'user-123',
    sessionId: 'session-123',
    clientInfo: {
      userAgent: 'test-agent',
      ipAddress: '10.0.0.1',
      deviceId: 'device-123',
      securityClearance: 'SECRET'
    }
  };

  beforeEach(() => {
    // Initialize mocks with security context
    mockKeycloakClient = {
      grantManager: {
        obtainDirectly: jest.fn(),
        validateToken: jest.fn(),
        createGrant: jest.fn()
      }
    } as any;

    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn()
    } as any;

    mockAuditLogger = jest.spyOn(console, 'log').mockImplementation();

    authService = new AuthService(
      mockKeycloakClient,
      mockRedisClient,
      {} as any // validator mock
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate() - Primary Authentication Flow', () => {
    test('should successfully authenticate with valid credentials', async () => {
      // Setup FedRAMP compliant mock responses
      const mockGrant = {
        access_token: {
          token: 'valid-token',
          content: {
            sub: 'user-123',
            session_state: 'session-123'
          }
        },
        refresh_token: {
          token: 'refresh-token'
        }
      };

      mockKeycloakClient.grantManager.obtainDirectly.mockResolvedValue(mockGrant);
      mockRedisClient.get.mockResolvedValue(null); // No lockout

      const result = await authService.authenticate(validRequest);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('clearanceLevel');
      expect(mockAuditLogger).toHaveBeenCalled();
    });

    test('should enforce account lockout after max failed attempts', async () => {
      mockRedisClient.get.mockResolvedValue('5'); // Max attempts reached
      
      const result = await authService.authenticate(validRequest);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AuthErrorCodes.ACCESS_DENIED);
      expect(mockAuditLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOCKOUT',
          severity: ErrorSeverity.ERROR
        })
      );
    });

    test('should require MFA for high security clearance', async () => {
      const highClearanceRequest = {
        ...validRequest,
        clientInfo: {
          ...validRequest.clientInfo,
          securityClearance: 'TOP_SECRET'
        }
      };

      mockKeycloakClient.grantManager.obtainDirectly.mockResolvedValue({
        access_token: {
          content: { sub: 'user-123' }
        }
      });

      const result = await authService.authenticate(highClearanceRequest);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('mfaRequired', true);
      expect(result).toHaveProperty('sessionId');
    });
  });

  describe('verifyMfa() - Multi-Factor Authentication', () => {
    const validMfaRequest = {
      requestId: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      mfaCode: '123456',
      tempToken: 'temp-token-123',
      userId: 'user-123',
      sessionId: 'session-123',
      clientInfo: validRequest.clientInfo
    };

    test('should successfully verify valid MFA code', async () => {
      const mockMfaSession = JSON.stringify({
        userId: 'user-123',
        mfaType: 'totp',
        sessionId: 'session-123',
        grant: {
          access_token: { content: { sub: 'user-123' } }
        }
      });

      mockRedisClient.get.mockResolvedValue(mockMfaSession);

      const result = await authService.verifyMfa(validMfaRequest);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockAuditLogger).toHaveBeenCalled();
    });

    test('should reject expired MFA sessions', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await authService.verifyMfa(validMfaRequest);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AuthErrorCodes.SESSION_EXPIRED);
    });
  });

  describe('refreshToken() - Token Refresh Flow', () => {
    test('should successfully refresh valid token', async () => {
      const mockGrant = {
        access_token: {
          token: 'new-token',
          content: {
            sub: 'user-123',
            session_state: 'session-123'
          }
        },
        refresh_token: {
          token: 'new-refresh-token'
        }
      };

      mockKeycloakClient.grantManager.createGrant.mockResolvedValue(mockGrant);
      mockRedisClient.get.mockResolvedValue(null); // Token not blacklisted

      const result = await authService.refreshToken('valid-refresh-token');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockAuditLogger).toHaveBeenCalled();
    });

    test('should reject blacklisted refresh tokens', async () => {
      mockRedisClient.get.mockResolvedValue('blacklisted');

      const result = await authService.refreshToken('blacklisted-token');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_TOKEN);
    });
  });

  describe('Security Context Validation', () => {
    test('should validate security clearance levels', async () => {
      const lowClearanceRequest = {
        ...validRequest,
        clientInfo: {
          ...validRequest.clientInfo,
          securityClearance: 'CONFIDENTIAL'
        }
      };

      mockKeycloakClient.grantManager.obtainDirectly.mockResolvedValue({
        access_token: {
          content: { sub: 'user-123' }
        }
      });

      const result = await authService.authenticate(lowClearanceRequest);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AuthErrorCodes.INSUFFICIENT_CLEARANCE);
    });

    test('should enforce encryption requirements', async () => {
      mockKeycloakClient.grantManager.obtainDirectly.mockRejectedValue(
        new Error('Encryption validation failed')
      );

      const result = await authService.authenticate(validRequest);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(SecurityErrorCodes.ENCRYPTION_FAILED);
    });
  });
});