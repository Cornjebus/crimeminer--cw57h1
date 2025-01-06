// External imports with versions
import { setupServer } from 'msw/node'; // v1.2.0
import type { SetupServer } from 'msw/node'; // v1.2.0
import winston from 'winston'; // v3.8.0

// Security and compliance constants
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Cache-Control': 'no-store, max-age=0',
};

const COMPLIANCE_CONFIG = {
  fedrampLevel: 'HIGH',
  cjisCompliant: true,
  auditRequired: true,
  dataClassification: ['CONTROLLED_UNCLASSIFIED', 'LAW_ENFORCEMENT_SENSITIVE'],
  retentionPeriod: '7y',
};

// Configure audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mock-server' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'mock-server-audit.log' })
  ]
});

// Audit logging decorator
function auditLog(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    auditLogger.info('Mock server operation', {
      method: propertyKey,
      args: args,
      timestamp: new Date().toISOString()
    });
    return originalMethod.apply(this, args);
  };
  return descriptor;
}

// Security validation function
function validateSecurityCompliance(mockResponse: Response): boolean {
  try {
    // Validate security headers
    const headers = mockResponse.headers;
    const hasRequiredHeaders = Object.entries(SECURITY_HEADERS)
      .every(([key, value]) => headers.get(key) === value);
    if (!hasRequiredHeaders) return false;

    // Validate data classification
    const classification = headers.get('X-Data-Classification');
    if (!COMPLIANCE_CONFIG.dataClassification.includes(classification)) {
      return false;
    }

    // Verify audit logging
    if (COMPLIANCE_CONFIG.auditRequired && !headers.get('X-Audit-ID')) {
      return false;
    }

    // Check CJIS compliance
    if (COMPLIANCE_CONFIG.cjisCompliant && !headers.get('X-CJIS-Compliant')) {
      return false;
    }

    return true;
  } catch (error) {
    auditLogger.error('Security compliance validation failed', { error });
    return false;
  }
}

// Security middleware for request handlers
const securityMiddleware = (handler: any) => async (...args: any[]) => {
  const response = await handler(...args);
  
  // Add security headers
  const enhancedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      ...SECURITY_HEADERS,
      'X-Audit-ID': crypto.randomUUID(),
      'X-CJIS-Compliant': 'true',
      'X-Data-Classification': COMPLIANCE_CONFIG.dataClassification[0]
    }
  });

  // Validate security compliance
  if (!validateSecurityCompliance(enhancedResponse)) {
    auditLogger.error('Security compliance check failed');
    throw new Error('Response failed security compliance checks');
  }

  return enhancedResponse;
};

// Create mock server with security enhancements
@auditLog
function createMockServer(): SetupServer {
  // Initialize handlers array (would be populated from other handler files)
  const handlers: any[] = [];

  // Create server with security-enhanced handlers
  const server = setupServer(
    ...handlers.map(handler => securityMiddleware(handler))
  );

  // Add security-related listeners
  server.events.on('request:start', ({ request }) => {
    auditLogger.info('Mock request started', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    });
  });

  server.events.on('request:end', ({ request, response }) => {
    auditLogger.info('Mock request completed', {
      method: request.method,
      url: request.url,
      status: response.status,
      compliance: validateSecurityCompliance(response)
    });
  });

  server.events.on('request:error', ({ error, request }) => {
    auditLogger.error('Mock request error', {
      error,
      method: request.method,
      url: request.url
    });
  });

  return server;
}

// Create and export server instance
export const server = createMockServer();

// Export compliance validation for testing
export const validateCompliance = validateSecurityCompliance;

// Export default server instance
export default server;