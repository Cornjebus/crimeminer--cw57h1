/**
 * @fileoverview Type definitions for authentication and authorization in CrimeMiner
 * Implements FedRAMP High and CJIS compliance requirements for authentication structures
 * @version 1.0.0
 */

/**
 * Available user roles as defined in the authorization matrix
 */
export enum UserRole {
  INVESTIGATOR = 'INVESTIGATOR',
  SUPERVISOR = 'SUPERVISOR',
  ADMINISTRATOR = 'ADMINISTRATOR',
  ANALYST = 'ANALYST',
  AUDITOR = 'AUDITOR'
}

/**
 * Security clearance levels for CJIS compliance
 */
export enum SecurityClearanceLevel {
  TOP_SECRET = 'TOP_SECRET',
  SECRET = 'SECRET',
  CONFIDENTIAL = 'CONFIDENTIAL'
}

/**
 * Access levels for FedRAMP compliance
 */
export enum AccessLevel {
  FULL = 'FULL',
  RESTRICTED = 'RESTRICTED',
  READ_ONLY = 'READ_ONLY'
}

/**
 * Supported multi-factor authentication methods
 */
export enum MFAMethod {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  AUTHENTICATOR = 'AUTHENTICATOR',
  HARDWARE_TOKEN = 'HARDWARE_TOKEN'
}

/**
 * User interface with FedRAMP and CJIS compliance fields
 */
export interface User {
  id: string;
  username: string;
  email: string;
  roles: UserRole[];
  department: string;
  lastLogin: Date;
  mfaEnabled: boolean;
  lastPasswordChange: Date;
  securityClearance: SecurityClearanceLevel;
  accessLevel: AccessLevel;
  sessionTimeout: number;
  mfaPreference: MFAMethod;
}

/**
 * Login request payload interface with MFA and SSO support
 */
export interface LoginRequest {
  username: string;
  password: string;
  mfaCode: string;
  mfaMethod: MFAMethod;
  ssoToken: string;
}

/**
 * Login response data interface with enhanced security features
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  mfaRequired: boolean;
  expiresIn: number;
  tokenType: string;
  sessionId: string;
  permissions: string[];
}

/**
 * Authentication state management interface with security tracking
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  mfaRequired: boolean;
  loading: boolean;
  error: string | null;
  sessionExpiry: Date;
  lastActivity: Date;
  securityLevel: SecurityClearanceLevel;
}