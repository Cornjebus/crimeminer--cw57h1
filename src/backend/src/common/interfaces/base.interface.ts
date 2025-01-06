/**
 * @file Core interface definitions for CrimeMiner backend services
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant base interfaces for entities,
 * requests, responses, and error handling used across the platform
 */

import { AuthErrorCodes } from '../constants/error-codes';

/**
 * Severity levels for error reporting in compliance with FedRAMP requirements
 */
export enum ErrorSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Interface for client information tracking required by CJIS
 */
export interface IClientInfo {
  userAgent: string;
  ipAddress: string;
  deviceId?: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
  };
  securityClearance: string;
}

/**
 * Interface for audit trail entries required by FedRAMP
 */
export interface IAuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  details: Record<string, any>;
  ipAddress: string;
  sessionId: string;
}

/**
 * Base interface for all database entities with comprehensive audit fields
 */
export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  version: number;
  auditLog: IAuditEntry[];
}

/**
 * Base interface for all API requests with enhanced security tracking
 */
export interface IBaseRequest {
  requestId: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  clientInfo: IClientInfo;
}

/**
 * Base interface for all API responses with audit and performance tracking
 */
export interface IBaseResponse {
  success: boolean;
  requestId: string;
  timestamp: Date;
  processingTime: number;
  auditToken: string;
}

/**
 * Interface for detailed error information with security tracking
 */
export interface IErrorDetails {
  code: string;
  message: string;
  details: Record<string, any>;
  source: string;
  timestamp: Date;
  stackTrace: string;
}

/**
 * Interface for standardized error responses with security tracking
 * Implements FedRAMP and CJIS compliant error handling
 */
export interface IErrorResponse extends IBaseResponse {
  success: false;
  error: IErrorDetails;
  incidentId: string;
  severity: ErrorSeverity;
  auditToken: string;
}

/**
 * Interface for pagination metadata in list responses
 */
export interface IPaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * Interface for list responses with pagination
 */
export interface IListResponse<T> extends IBaseResponse {
  data: T[];
  meta: IPaginationMeta;
}

/**
 * Interface for single item responses
 */
export interface IItemResponse<T> extends IBaseResponse {
  data: T;
}

/**
 * Type guard to check if response is an error response
 */
export function isErrorResponse(response: IBaseResponse): response is IErrorResponse {
  return !response.success;
}

/**
 * Interface for security classification metadata required by CJIS
 */
export interface ISecurityClassification {
  level: string;
  caveats: string[];
  handlingInstructions: string[];
  declassificationDate?: Date;
}

/**
 * Interface for chain of custody tracking required by CJIS
 */
export interface IChainOfCustody {
  evidenceId: string;
  custodyEvents: Array<{
    timestamp: Date;
    action: string;
    userId: string;
    location: string;
    reason: string;
    verificationHash: string;
  }>;
}

/**
 * Interface for data retention policies required by FedRAMP
 */
export interface IRetentionPolicy {
  retentionPeriod: number;
  dispositionInstructions: string;
  legalHold: boolean;
  reviewRequired: boolean;
  lastReviewDate?: Date;
}