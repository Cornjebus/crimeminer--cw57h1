// External imports with versions
import '@testing-library/jest-dom/extend-expect'; // v5.16.5
import 'whatwg-fetch'; // v3.6.2

// Internal imports
import { server } from './mocks/server';
import type { ComplianceValidationResult } from './types';

// Security and compliance constants
const TEST_ENVIRONMENT_CONFIG = {
  timeoutMs: 30000,
  maxTestRunTimeMs: 300000,
  isolationLevel: 'strict',
  auditEnabled: true,
  dataClassification: 'LAW_ENFORCEMENT_SENSITIVE',
  complianceLevel: 'FEDRAMP_HIGH'
};

// Security headers for test requests
const SECURE_TEST_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Cache-Control': 'no-store, max-age=0'
};

/**
 * Validates test environment compliance with security requirements
 * @returns Promise<ComplianceValidationResult>
 */
async function validateCompliance(): Promise<ComplianceValidationResult> {
  try {
    // Verify environment isolation
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test environment isolation violation');
    }

    // Verify security headers
    Object.entries(SECURE_TEST_HEADERS).forEach(([key, value]) => {
      if (!global.Headers || !new Headers().has(key)) {
        throw new Error(`Missing required security header: ${key}`);
      }
    });

    // Verify test timeouts
    if (jest.getTimerCount() > TEST_ENVIRONMENT_CONFIG.maxTestRunTimeMs) {
      throw new Error('Test execution time limit exceeded');
    }

    return {
      status: 'passed',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      complianceLevel: TEST_ENVIRONMENT_CONFIG.complianceLevel
    };
  } catch (error) {
    throw new Error(`Compliance validation failed: ${error.message}`);
  }
}

/**
 * Sets up security headers for test environment
 */
function setupSecurityHeaders(): void {
  Object.entries(SECURE_TEST_HEADERS).forEach(([key, value]) => {
    if (global.Headers) {
      const headers = new Headers();
      headers.set(key, value);
    }
  });
}

/**
 * Cleans up secure test environment
 */
async function cleanupSecureEnvironment(): Promise<void> {
  // Clear sensitive data from memory
  if (global.localStorage) {
    localStorage.clear();
  }
  if (global.sessionStorage) {
    sessionStorage.clear();
  }
  
  // Reset security context
  jest.restoreAllMocks();
  jest.clearAllTimers();
}

/**
 * Clears security context between tests
 */
function clearSecurityContext(): void {
  // Reset security-related mocks and handlers
  jest.clearAllMocks();
  if (global.localStorage) {
    localStorage.clear();
  }
}

// Configure global test environment
beforeAll(async () => {
  // Validate compliance before starting tests
  await validateCompliance();
  
  // Configure MSW server with security error handling
  server.listen({
    onUnhandledRequest: 'error',
    onUnhandledResponse: async (req, res) => {
      throw new Error(`Unhandled response for ${req.method} ${req.url}`);
    }
  });
  
  // Setup security headers
  setupSecurityHeaders();
  
  // Configure global test timeout
  jest.setTimeout(TEST_ENVIRONMENT_CONFIG.timeoutMs);
});

// Cleanup after all tests
afterAll(async () => {
  await cleanupSecureEnvironment();
  server.close();
});

// Reset handlers and security context after each test
afterEach(() => {
  server.resetHandlers();
  clearSecurityContext();
});

// Configure global Jest matchers
expect.extend({
  toBeSecure(received) {
    const hasSecurityHeaders = Object.entries(SECURE_TEST_HEADERS)
      .every(([key, value]) => received.headers?.get(key) === value);
      
    return {
      pass: hasSecurityHeaders,
      message: () => hasSecurityHeaders
        ? 'Expected response not to have security headers'
        : 'Expected response to have all required security headers'
    };
  }
});

// Export test utilities for use in test files
export {
  validateCompliance,
  setupSecurityHeaders,
  clearSecurityContext,
  TEST_ENVIRONMENT_CONFIG,
  SECURE_TEST_HEADERS
};