/**
 * @file Unit tests for secure logging utility
 * @version 1.0.0
 * @description Verifies FedRAMP High and CJIS compliant logging functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'; // v29.7.0
import winston from 'winston'; // v3.11.0
import crypto from 'crypto';
import { Logger } from '../../src/common/utils/logger.util';
import { SystemErrorCodes } from '../../src/common/constants/error-codes';
import { IBaseRequest } from '../../src/common/interfaces/base.interface';

// Mock winston
jest.mock('winston', () => ({
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
    printf: jest.fn()
  },
  createLogger: jest.fn(),
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
    Syslog: jest.fn()
  }
}));

describe('Logger', () => {
  let testLogger: Logger;
  let mockWinstonLogger: jest.SpyInstance;
  let mockCryptoSign: jest.SpyInstance;
  let mockValidateIntegrity: jest.SpyInstance;

  // Test data with required security fields
  const validSecurityContext: Partial<IBaseRequest> = {
    requestId: 'test-req-123',
    userId: 'user-123',
    sessionId: 'session-456',
    timestamp: new Date(),
    clientInfo: {
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
      securityClearance: 'SECRET'
    }
  };

  beforeEach(() => {
    // Setup crypto mocks
    mockCryptoSign = jest.spyOn(crypto, 'createSign').mockReturnValue({
      update: jest.fn(),
      sign: jest.fn().mockReturnValue(Buffer.from('test-signature'))
    } as any);

    // Setup winston mock
    mockWinstonLogger = jest.spyOn(winston, 'createLogger').mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    } as any);

    // Initialize test logger
    testLogger = new Logger('test-service', {
      encryptionKey: 'test-key-base64',
      syslogHost: 'localhost',
      syslogPort: 514
    });

    // Mock integrity validation
    mockValidateIntegrity = jest.spyOn(testLogger as any, 'signLogEntry');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with FedRAMP compliant configuration', () => {
    expect(mockWinstonLogger).toHaveBeenCalledWith(expect.objectContaining({
      handleExceptions: true,
      handleRejections: true
    }));
  });

  it('should enforce required CJIS security fields', () => {
    const invalidContext = { ...validSecurityContext };
    delete invalidContext.sessionId;

    expect(() => {
      testLogger.info('test message', invalidContext);
    }).toThrow('Missing required security field: sessionId');
  });

  it('should properly mask PII data in logs', () => {
    const message = 'User SSN: 123-45-6789, CC: 4111-1111-1111-1111';
    const metadata = validSecurityContext;

    testLogger.info(message, metadata);

    expect(mockWinstonLogger.mock.results[0].value.info)
      .toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('[REDACTED]')
      }));
  });

  it('should include cryptographic signatures for log integrity', () => {
    const message = 'Test log message';
    testLogger.info(message, validSecurityContext);

    expect(mockValidateIntegrity).toHaveBeenCalled();
    expect(mockCryptoSign).toHaveBeenCalled();
  });

  it('should handle errors with proper security context', () => {
    const error = new Error('Test error');
    const mockWinstonError = mockWinstonLogger.mock.results[0].value.error;

    testLogger.error('Error occurred', error, validSecurityContext);

    expect(mockWinstonError).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        name: error.name,
        message: error.message,
        code: SystemErrorCodes.INTERNAL_SERVER_ERROR
      }),
      ...validSecurityContext
    }));
  });

  it('should enforce secure log levels', () => {
    const levels = ['error', 'warn', 'info', 'debug'];
    const message = 'Test message';

    levels.forEach(level => {
      testLogger[level](message, validSecurityContext);
      const mockMethod = mockWinstonLogger.mock.results[0].value[level];
      expect(mockMethod).toHaveBeenCalledWith(expect.objectContaining({
        message,
        ...validSecurityContext
      }));
    });
  });

  it('should include required FedRAMP audit fields', () => {
    testLogger.info('Test message', validSecurityContext);

    const mockInfo = mockWinstonLogger.mock.results[0].value.info;
    expect(mockInfo).toHaveBeenCalledWith(expect.objectContaining({
      timestamp: expect.any(String),
      service: 'test-service',
      hostname: expect.any(String),
      pid: expect.any(Number)
    }));
  });

  it('should validate syslog transport configuration', () => {
    expect(winston.transports.Syslog).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 514,
      protocol: 'tls'
    }));
  });

  it('should handle sensitive error stacks securely', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at Object.<anonymous> (/sensitive/path/file.ts:123:45)';

    testLogger.error('Error occurred', error, validSecurityContext);

    const mockError = mockWinstonLogger.mock.results[0].value.error;
    expect(mockError).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        stack: expect.not.stringContaining('/sensitive/path/')
      })
    }));
  });

  it('should enforce TLS for syslog transport', () => {
    expect(winston.transports.Syslog).toHaveBeenCalledWith(expect.objectContaining({
      protocol: 'tls'
    }));
  });

  it('should validate log message integrity', () => {
    const message = 'Test message';
    testLogger.info(message, validSecurityContext);

    expect(mockValidateIntegrity).toHaveBeenCalledWith(expect.objectContaining({
      message,
      ...validSecurityContext
    }));
  });
});