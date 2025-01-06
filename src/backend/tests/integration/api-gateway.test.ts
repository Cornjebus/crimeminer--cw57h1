/**
 * @file Integration tests for CrimeMiner API Gateway
 * @version 1.0.0
 * @description Comprehensive test suite validating FedRAMP High and CJIS compliance
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals'; // v29.5.0
import request from 'supertest'; // v6.3.3
import Redis from 'ioredis-mock'; // v8.2.2
import helmet from 'helmet'; // v6.0.0
import jwt from 'jsonwebtoken';

import app from '../../src/api-gateway/src/index';
import { validateToken } from '../../src/api-gateway/src/middleware/auth.middleware';
import { RateLimitOptions } from '../../src/api-gateway/src/middleware/rate-limit.middleware';
import { SystemErrorCodes, AuthErrorCodes } from '../../src/common/constants/error-codes';

// Test configuration constants
const TEST_JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-secret';
const TEST_USER_ID = 'test-user-123';
const TEST_MFA_SECRET = process.env.TEST_MFA_SECRET || 'test-mfa-secret';
const TEST_DEVICE_ID = 'test-device-456';

/**
 * Generate test JWT token with configurable security context
 */
const generateTestToken = (
  payload: any = {},
  mfaVerified: boolean = false,
  deviceContext: any = {}
): string => {
  return jwt.sign(
    {
      sub: TEST_USER_ID,
      roles: ['INVESTIGATOR'],
      clearanceLevel: 'SECRET',
      mfaVerified,
      deviceFingerprint: deviceContext.deviceId || TEST_DEVICE_ID,
      sessionContext: {
        ...deviceContext,
        lastVerified: new Date().toISOString()
      },
      ...payload
    },
    TEST_JWT_SECRET,
    { expiresIn: '15m' }
  );
};

/**
 * Configure mock Redis instance for rate limit testing
 */
const setupMockRedis = (options: Partial<RateLimitOptions> = {}) => {
  const redis = new Redis();
  redis.on('error', (err) => console.error('Redis Mock Error:', err));
  return redis;
};

describe('API Gateway Integration Tests', () => {
  let mockRedis: Redis;

  beforeAll(async () => {
    mockRedis = setupMockRedis();
    // Configure test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.MFA_SECRET = TEST_MFA_SECRET;
  });

  afterAll(async () => {
    await mockRedis.quit();
  });

  describe('Authentication Tests', () => {
    test('Should reject requests without JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/cases')
        .expect(401);

      expect(response.body.error.code).toBe(AuthErrorCodes.INVALID_TOKEN);
    });

    test('Should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        { sub: TEST_USER_ID },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      const response = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe(AuthErrorCodes.TOKEN_EXPIRED);
    });

    test('Should reject tokens without MFA verification', async () => {
      const token = generateTestToken({}, false);

      const response = await request(app)
        .get('/api/v1/evidence')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error.code).toBe(AuthErrorCodes.MFA_REQUIRED);
    });

    test('Should reject tokens with invalid device context', async () => {
      const token = generateTestToken({}, true, { deviceId: 'invalid-device' });

      const response = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(401);

      expect(response.body.error.code).toBe(AuthErrorCodes.INVALID_DEVICE);
    });

    test('Should accept valid tokens with MFA and device verification', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });

      await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(200);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('Should enforce authentication endpoint limits', async () => {
      const requests = Array(11).fill(null);
      
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .expect((res) => {
            expect(res.headers['x-ratelimit-remaining']).toBeDefined();
          });
      }

      const response = await request(app)
        .post('/api/v1/auth/login')
        .expect(429);

      expect(response.body.error.code).toBe(SystemErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(response.headers['retry-after']).toBeDefined();
    });

    test('Should enforce evidence upload limits', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });
      const requests = Array(101).fill(null);

      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/v1/evidence/upload')
          .set('Authorization', `Bearer ${token}`)
          .set('X-Device-Fingerprint', TEST_DEVICE_ID);
      }

      const response = await request(app)
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(429);

      expect(response.body.error.code).toBe(SystemErrorCodes.RATE_LIMIT_EXCEEDED);
    });

    test('Should handle burst traffic scenarios', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });
      const requests = Array(5).fill(null);

      const responses = await Promise.all(
        requests.map(() => 
          request(app)
            .get('/api/v1/cases')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        )
      );

      responses.forEach(response => {
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      });
    });
  });

  describe('Security Header Tests', () => {
    test('Should set comprehensive CSP directives', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    });

    test('Should configure CORS for allowed origins', async () => {
      const response = await request(app)
        .options('/api/v1/cases')
        .set('Origin', 'https://allowed-origin.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    test('Should enable HSTS with proper settings', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['strict-transport-security'])
        .toBe('max-age=31536000; includeSubDomains; preload');
    });
  });

  describe('Routing Tests', () => {
    test('Should route requests to correct services', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });

      await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(200);

      await request(app)
        .get('/api/v1/evidence')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(200);
    });

    test('Should validate request schemas', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });

      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VAL_001');
    });
  });

  describe('Compliance Tests', () => {
    test('Should maintain comprehensive audit logs', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });

      const response = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    test('Should protect PII in responses', async () => {
      const token = generateTestToken({}, true, { deviceId: TEST_DEVICE_ID });

      const response = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Device-Fingerprint', TEST_DEVICE_ID)
        .expect(200);

      expect(response.body).not.toContain('ssn');
      expect(response.body).not.toContain('creditCard');
    });
  });
});