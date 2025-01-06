/**
 * Core API-related constants for the CrimeMiner web application.
 * Implements FedRAMP High and CJIS compliance requirements.
 * @version 1.0.0
 */

import { ApiResponse, ApiError } from '../types/common.types';

// Current API version with CJIS compliance tracking
export const API_VERSION = 'v1';

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.crimeminer.gov';

/**
 * Comprehensive API endpoints including audit and compliance paths
 */
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_BASE_URL}/${API_VERSION}/auth/login`,
    LOGOUT: `${API_BASE_URL}/${API_VERSION}/auth/logout`,
    REFRESH: `${API_BASE_URL}/${API_VERSION}/auth/refresh`,
    MFA: `${API_BASE_URL}/${API_VERSION}/auth/mfa`,
    CERT_VALIDATE: `${API_BASE_URL}/${API_VERSION}/auth/certificate`
  },
  CASES: {
    BASE: `${API_BASE_URL}/${API_VERSION}/cases`,
    DETAILS: (id: string) => `${API_BASE_URL}/${API_VERSION}/cases/${id}`,
    EVIDENCE: (id: string) => `${API_BASE_URL}/${API_VERSION}/cases/${id}/evidence`,
    TIMELINE: (id: string) => `${API_BASE_URL}/${API_VERSION}/cases/${id}/timeline`,
    ACCESS_LOG: (id: string) => `${API_BASE_URL}/${API_VERSION}/cases/${id}/access-log`
  },
  EVIDENCE: {
    UPLOAD: `${API_BASE_URL}/${API_VERSION}/evidence/upload`,
    PROCESS: (id: string) => `${API_BASE_URL}/${API_VERSION}/evidence/${id}/process`,
    CHAIN: (id: string) => `${API_BASE_URL}/${API_VERSION}/evidence/${id}/chain`,
    VALIDATE: (id: string) => `${API_BASE_URL}/${API_VERSION}/evidence/${id}/validate`
  },
  ANALYSIS: {
    TRANSCRIBE: `${API_BASE_URL}/${API_VERSION}/analysis/transcribe`,
    ENTITIES: `${API_BASE_URL}/${API_VERSION}/analysis/entities`,
    RELATIONSHIPS: `${API_BASE_URL}/${API_VERSION}/analysis/relationships`,
    PATTERNS: `${API_BASE_URL}/${API_VERSION}/analysis/patterns`
  },
  SEARCH: {
    QUERY: `${API_BASE_URL}/${API_VERSION}/search`,
    ADVANCED: `${API_BASE_URL}/${API_VERSION}/search/advanced`,
    SUGGEST: `${API_BASE_URL}/${API_VERSION}/search/suggest`
  },
  REPORTS: {
    GENERATE: `${API_BASE_URL}/${API_VERSION}/reports/generate`,
    EXPORT: `${API_BASE_URL}/${API_VERSION}/reports/export`,
    TEMPLATES: `${API_BASE_URL}/${API_VERSION}/reports/templates`
  },
  AUDIT: {
    LOGS: `${API_BASE_URL}/${API_VERSION}/audit/logs`,
    EVENTS: `${API_BASE_URL}/${API_VERSION}/audit/events`,
    COMPLIANCE: `${API_BASE_URL}/${API_VERSION}/audit/compliance`
  },
  COMPLIANCE: {
    CHECK: `${API_BASE_URL}/${API_VERSION}/compliance/check`,
    REPORT: `${API_BASE_URL}/${API_VERSION}/compliance/report`,
    VIOLATIONS: `${API_BASE_URL}/${API_VERSION}/compliance/violations`
  }
};

/**
 * Standard HTTP methods
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
} as const;

/**
 * Enhanced API headers for security and compliance tracking
 */
export const API_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  REQUEST_ID: 'X-Request-ID',
  CLASSIFICATION_LEVEL: 'X-Classification-Level',
  AUDIT_USER_ID: 'X-Audit-User-ID',
  SESSION_ID: 'X-Session-ID',
  CLIENT_CERTIFICATE: 'X-Client-Certificate',
  CHAIN_OF_CUSTODY: 'X-Chain-Of-Custody',
  COMPLIANCE_LEVEL: 'X-Compliance-Level',
  API_VERSION: 'X-API-Version',
  AGENCY_ID: 'X-Agency-ID',
  JURISDICTION: 'X-Jurisdiction'
} as const;

/**
 * Configurable timeouts for different API operations (in milliseconds)
 */
export const API_TIMEOUT = {
  DEFAULT: parseInt(import.meta.env.VITE_API_TIMEOUT) || 30000,
  EVIDENCE_UPLOAD: 300000, // 5 minutes
  ANALYSIS: 600000, // 10 minutes
  REPORT_GENERATION: 120000, // 2 minutes
  COMPLIANCE_CHECK: 60000 // 1 minute
} as const;

/**
 * Comprehensive error codes including security and compliance failures
 */
export const API_ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  FORBIDDEN: 'ERR_FORBIDDEN',
  ACCESS_DENIED: 'ERR_ACCESS_DENIED',
  SESSION_EXPIRED: 'ERR_SESSION_EXPIRED',
  MFA_REQUIRED: 'ERR_MFA_REQUIRED',
  
  // Security & Compliance
  CERT_INVALID: 'ERR_CERT_INVALID',
  COMPLIANCE_VIOLATION: 'ERR_COMPLIANCE_VIOLATION',
  CLASSIFICATION_MISMATCH: 'ERR_CLASSIFICATION_MISMATCH',
  AUDIT_REQUIRED: 'ERR_AUDIT_REQUIRED',
  CHAIN_BROKEN: 'ERR_CHAIN_BROKEN',
  
  // Resource Errors
  NOT_FOUND: 'ERR_NOT_FOUND',
  VALIDATION_ERROR: 'ERR_VALIDATION',
  DUPLICATE_ENTRY: 'ERR_DUPLICATE',
  
  // System Errors
  SERVER_ERROR: 'ERR_SERVER',
  SERVICE_UNAVAILABLE: 'ERR_SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  TIMEOUT: 'ERR_TIMEOUT',
  
  // Data Errors
  DATA_CORRUPTION: 'ERR_DATA_CORRUPTION',
  ENCRYPTION_FAILED: 'ERR_ENCRYPTION_FAILED',
  INTEGRITY_CHECK_FAILED: 'ERR_INTEGRITY_CHECK'
} as const;

/**
 * Required compliance levels based on environment configuration
 */
export const COMPLIANCE_LEVELS = {
  FEDRAMP_HIGH: 'FEDRAMP_HIGH',
  CJIS: 'CJIS',
  REQUIRED_LEVEL: import.meta.env.VITE_COMPLIANCE_LEVEL || 'FEDRAMP_HIGH'
} as const;