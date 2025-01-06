/**
 * @fileoverview Defines type-safe constant route paths and parameter patterns for the CrimeMiner web application.
 * Provides centralized routing configuration with security boundaries and parameter validation.
 * @version 1.0.0
 */

/**
 * Type definitions for route parameters used in dynamic routes
 */
export type RouteParams = {
  /** Case identifier in format A-Z0-9, 8 characters */
  caseId: string;
  /** Evidence identifier in format A-Z0-9, 12 characters */
  evidenceId: string;
};

/**
 * Immutable route path constants for application routing
 * These paths align with the application's layout structure and security boundaries
 */
export const ROUTES = {
  /** Authentication entry point */
  LOGIN: '/login',
  
  /** Main dashboard view after authentication */
  DASHBOARD: '/dashboard',
  
  /** Case management routes */
  CASES: '/cases',
  CASE_DETAILS: '/cases/:caseId',
  
  /** Evidence management routes */
  EVIDENCE: '/evidence',
  EVIDENCE_VIEWER: '/evidence/:evidenceId',
  
  /** Analysis and intelligence routes */
  ANALYSIS: '/analysis',
  
  /** Search functionality route */
  SEARCH: '/search',
  
  /** Report generation route */
  REPORTS: '/reports',
  
  /** User and system settings route */
  SETTINGS: '/settings'
} as const;

/**
 * Regular expression patterns for validating route parameters
 * Ensures proper format and security boundaries for dynamic route segments
 */
export const ROUTE_PATTERNS = {
  /** Validates 8-character alphanumeric case IDs */
  CASE_ID: /^[A-Z0-9]{8}$/,
  
  /** Validates 12-character alphanumeric evidence IDs */
  EVIDENCE_ID: /^[A-Z0-9]{12}$/
} as const;

/**
 * Helper function to validate a case ID parameter
 * @param caseId The case ID to validate
 * @returns boolean indicating if the case ID is valid
 */
export const isValidCaseId = (caseId: string): boolean => {
  return ROUTE_PATTERNS.CASE_ID.test(caseId);
};

/**
 * Helper function to validate an evidence ID parameter
 * @param evidenceId The evidence ID to validate
 * @returns boolean indicating if the evidence ID is valid
 */
export const isValidEvidenceId = (evidenceId: string): boolean => {
  return ROUTE_PATTERNS.EVIDENCE_ID.test(evidenceId);
};

/**
 * Helper function to build a case details route with a validated case ID
 * @param caseId The case ID to include in the route
 * @returns The constructed route path
 * @throws Error if case ID is invalid
 */
export const buildCaseRoute = (caseId: string): string => {
  if (!isValidCaseId(caseId)) {
    throw new Error('Invalid case ID format');
  }
  return ROUTES.CASE_DETAILS.replace(':caseId', caseId);
};

/**
 * Helper function to build an evidence viewer route with a validated evidence ID
 * @param evidenceId The evidence ID to include in the route
 * @returns The constructed route path
 * @throws Error if evidence ID is invalid
 */
export const buildEvidenceRoute = (evidenceId: string): string => {
  if (!isValidEvidenceId(evidenceId)) {
    throw new Error('Invalid evidence ID format');
  }
  return ROUTES.EVIDENCE_VIEWER.replace(':evidenceId', evidenceId);
};