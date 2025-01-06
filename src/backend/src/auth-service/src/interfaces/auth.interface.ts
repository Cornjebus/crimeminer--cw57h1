/**
 * @file Core authentication interface definitions for CrimeMiner auth service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant authentication interfaces
 * with enhanced security controls and multi-factor authentication support
 */

import { IBaseEntity, IBaseRequest, IBaseResponse } from '../../../common/interfaces/base.interface';

/**
 * Enhanced user entity interface with FedRAMP and CJIS compliance fields
 * Extends base entity interface with comprehensive security tracking
 */
export interface IUser extends IBaseEntity {
  username: string;
  email: string;
  roles: string[];
  mfaEnabled: boolean;
  lastLogin: Date;
  lastPasswordChange: Date;
  passwordHistory: string[]; // Stores hashed password history for password reuse prevention
  securityClearance: string; // CJIS security clearance level
  failedLoginAttempts: number;
  accountLockoutUntil: Date;
  requiredMfaTypes: string[]; // Required MFA methods based on clearance level
}

/**
 * Authentication request interface with MFA support
 * Implements FedRAMP High authentication requirements
 */
export interface IAuthRequest extends IBaseRequest {
  username: string;
  password: string; // Should be transmitted as salted hash
  mfaCode?: string; // Optional MFA code for two-step verification
}

/**
 * Enhanced authentication response interface with security context
 * Provides comprehensive session and access control information
 */
export interface IAuthResponse extends IBaseResponse {
  accessToken: string; // JWT access token
  refreshToken: string; // JWT refresh token
  expiresIn: number; // Token expiration in seconds
  mfaRequired: boolean; // Indicates if MFA verification is required
  sessionId: string; // Unique session identifier for audit tracking
  allowedResources: string[]; // List of authorized resources
  clearanceLevel: string; // Current session clearance level
  warningMessages: string[]; // Security warnings or notifications
}

/**
 * Enhanced JWT token payload interface with security context
 * Implements CJIS-compliant session tracking
 */
export interface ITokenPayload {
  sub: string; // Subject (user ID)
  roles: string[]; // User roles
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  clearance: string; // Security clearance level
  mfaCompleted: boolean; // MFA verification status
  deviceId: string; // Device identifier for session tracking
  sessionContext: string; // Additional session context for audit
}

/**
 * MFA verification request interface
 * Supports multiple MFA methods as required by FedRAMP High
 */
export interface IMfaRequest extends IBaseRequest {
  mfaCode: string; // Verification code from MFA device
  tempToken: string; // Temporary token from initial auth
}