/**
 * @file Core interface definitions for case entities in the CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant interfaces for case management
 * with enhanced security, compliance, and audit capabilities
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';

/**
 * Enhanced enumeration of possible case statuses including review state
 */
export enum CaseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
  PENDING_REVIEW = 'PENDING_REVIEW'
}

/**
 * Security classification levels for case data
 */
export enum SecurityClassification {
  UNCLASSIFIED = 'UNCLASSIFIED',
  SENSITIVE = 'SENSITIVE',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED = 'RESTRICTED'
}

/**
 * Interface for chain of custody records
 */
interface ICustodyRecord {
  timestamp: Date;
  userId: string;
  action: string;
  location: string;
  reason: string;
  verificationHash: string;
  metadata: Record<string, any>;
}

/**
 * Interface for access control configuration
 */
interface IAccessControl {
  readUsers: string[];
  writeUsers: string[];
  adminUsers: string[];
  departmentAccess: string[];
  securityGroups: string[];
  expirationDate?: Date;
}

/**
 * Interface for CJIS compliance metadata
 */
interface ICJISCompliance {
  complianceLevel: string;
  lastAuditDate: Date;
  auditResults: Record<string, any>;
  encryptionStatus: boolean;
  dataHandlingInstructions: string[];
  securityControls: string[];
}

/**
 * Interface for security metadata in responses
 */
interface ISecurityMetadata {
  classificationLevel: SecurityClassification;
  encryptedFields: string[];
  accessControl: IAccessControl;
  auditToken: string;
  integrityHash: string;
}

/**
 * Enhanced main interface for case entities with security and compliance fields
 */
export interface ICase extends IBaseEntity {
  title: string;
  description: string;
  status: CaseStatus;
  securityClassification: SecurityClassification;
  metadata: Record<string, any>;
  assignedUsers: string[];
  retentionPeriod: Date;
  chainOfCustody: ICustodyRecord[];
  encryptedFields: string[];
  accessControl: IAccessControl;
  cjisCompliance: ICJISCompliance;
}

/**
 * Enhanced interface for case creation requests with security fields
 */
export interface ICaseCreateRequest {
  title: string;
  description: string;
  securityClassification: SecurityClassification;
  metadata: Record<string, any>;
  assignedUsers: string[];
  retentionPeriod: Date;
  accessControl: IAccessControl;
}

/**
 * Enhanced interface for case update requests with security fields
 */
export interface ICaseUpdateRequest {
  title?: string;
  description?: string;
  status?: CaseStatus;
  securityClassification?: SecurityClassification;
  metadata?: Record<string, any>;
  assignedUsers?: string[];
  retentionPeriod?: Date;
  accessControl?: IAccessControl;
}

/**
 * Enhanced interface for case API responses with security metadata
 */
export interface ICaseResponse {
  case: ICase;
  securityMetadata: ISecurityMetadata;
}