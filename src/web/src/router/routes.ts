/**
 * @fileoverview Defines secure route configuration with enhanced security controls,
 * compliance validation, and audit logging capabilities for the CrimeMiner web application.
 * @version 1.0.0
 */

import { ComponentType } from 'react';
import { ROUTES } from '../constants/routes.constants';
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { ComplianceValidator } from '@crimeminer/compliance-utils'; // v1.0.0

/**
 * Security classification levels for routes
 */
export enum SecurityClassification {
  PUBLIC = 'PUBLIC',
  PROTECTED = 'PROTECTED',
  CONFIDENTIAL = 'CONFIDENTIAL',
  SECRET = 'SECRET'
}

/**
 * Audit logging levels for route access
 */
export enum AuditLevel {
  INFO = 'INFO',
  DETAILED = 'DETAILED',
  FULL = 'FULL'
}

/**
 * Types of compliance checks required for routes
 */
export type ComplianceCheck = 
  | 'BASIC' 
  | 'FEDRAMP_HIGH'
  | 'CJIS'
  | 'CASE_ACCESS'
  | 'EVIDENCE_ACCESS';

/**
 * User roles for access control
 */
export type UserRole = 
  | 'Investigator'
  | 'Supervisor'
  | 'Administrator'
  | 'Analyst'
  | 'Auditor';

/**
 * Enhanced route configuration with security metadata
 */
export interface SecureRouteConfig {
  path: string;
  component: ComponentType<any>;
  requireAuth: boolean;
  roles: UserRole[];
  securityLevel: SecurityClassification;
  complianceChecks: ComplianceCheck[];
  auditLevel: AuditLevel;
}

/**
 * Security-enhanced route configurations for the application
 */
const secureRoutes: SecureRouteConfig[] = [
  // Public routes
  {
    path: ROUTES.LOGIN,
    component: () => import('../pages/Login'),
    requireAuth: false,
    roles: [],
    securityLevel: SecurityClassification.PUBLIC,
    complianceChecks: ['BASIC'],
    auditLevel: AuditLevel.INFO
  },

  // Protected dashboard route
  {
    path: ROUTES.DASHBOARD,
    component: () => import('../pages/Dashboard'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.PROTECTED,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  },

  // Case management routes
  {
    path: ROUTES.CASES,
    component: () => import('../pages/Cases'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  },
  {
    path: ROUTES.CASE_DETAILS,
    component: () => import('../pages/CaseDetails'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS', 'CASE_ACCESS'],
    auditLevel: AuditLevel.FULL
  },

  // Evidence management routes
  {
    path: ROUTES.EVIDENCE,
    component: () => import('../pages/Evidence'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  },
  {
    path: ROUTES.EVIDENCE_VIEWER,
    component: () => import('../pages/EvidenceViewer'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS', 'EVIDENCE_ACCESS'],
    auditLevel: AuditLevel.FULL
  },

  // Analysis routes
  {
    path: ROUTES.ANALYSIS,
    component: () => import('../pages/Analysis'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  },

  // Search route
  {
    path: ROUTES.SEARCH,
    component: () => import('../pages/Search'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.PROTECTED,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  },

  // Report generation route
  {
    path: ROUTES.REPORTS,
    component: () => import('../pages/Reports'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator', 'Analyst'],
    securityLevel: SecurityClassification.CONFIDENTIAL,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.FULL
  },

  // Settings route
  {
    path: ROUTES.SETTINGS,
    component: () => import('../pages/Settings'),
    requireAuth: true,
    roles: ['Investigator', 'Supervisor', 'Administrator'],
    securityLevel: SecurityClassification.PROTECTED,
    complianceChecks: ['FEDRAMP_HIGH', 'CJIS'],
    auditLevel: AuditLevel.DETAILED
  }
];

export default secureRoutes;