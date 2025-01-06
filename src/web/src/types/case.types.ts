// @ts-check
/**
 * Type definitions for case-related data structures in the CrimeMiner web application.
 * Provides comprehensive type safety and validation for case management operations
 * while ensuring compliance with law enforcement data handling requirements.
 * @version 1.0.0
 */

// External imports
import { UUID } from 'crypto'; // v20.0.0+

/**
 * Enumeration of possible case statuses with additional states for granular workflow management
 */
export enum CaseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION'
}

/**
 * Interface defining case metadata structure with security considerations
 */
export interface CaseMetadata {
  /** Security classification level of the case */
  classification: string;
  /** Case priority level (1-5, where 1 is highest) */
  priority: number;
  /** Array of searchable tags associated with the case */
  tags: string[];
  /** Extensible custom fields for agency-specific metadata */
  customFields: Record<string, unknown>;
}

/**
 * Interface defining audit log entries for case operations
 */
export interface AuditEntry {
  /** Unique identifier for the audit entry */
  id: UUID;
  /** Timestamp of the audit event */
  timestamp: string;
  /** Type of action performed */
  action: string;
  /** User who performed the action */
  userId: UUID;
  /** Additional audit details */
  details: Record<string, unknown>;
}

/**
 * Main interface for case entities with enhanced audit fields and strict typing
 */
export interface Case {
  /** Unique identifier for the case */
  id: UUID;
  /** Case title - searchable field */
  title: string;
  /** Detailed case description */
  description: string;
  /** Current case status */
  status: CaseStatus;
  /** Structured metadata for the case */
  metadata: CaseMetadata;
  /** List of user IDs assigned to the case */
  assignedUsers: UUID[];
  /** ISO timestamp of case creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** User ID of case creator */
  createdBy: UUID;
  /** User ID of last modifier */
  lastModifiedBy: UUID;
}

/**
 * Interface for case creation requests with validated metadata
 */
export interface CaseCreateRequest {
  /** Required case title */
  title: string;
  /** Optional case description */
  description: string;
  /** Required structured metadata */
  metadata: CaseMetadata;
  /** Optional initial assigned users */
  assignedUsers: UUID[];
}

/**
 * Interface for case update requests with strict validation
 */
export interface CaseUpdateRequest {
  /** Optional updated title */
  title?: string;
  /** Optional updated description */
  description?: string;
  /** Optional updated status */
  status?: CaseStatus;
  /** Optional updated metadata */
  metadata?: Partial<CaseMetadata>;
  /** Optional updated assigned users */
  assignedUsers?: UUID[];
}

/**
 * Interface for single case API responses with audit information
 */
export interface CaseResponse {
  /** The case data */
  case: Case;
  /** Associated audit log entries */
  auditLog: AuditEntry[];
}

/**
 * Interface for paginated case list API responses with enhanced pagination info
 */
export interface CaseListResponse {
  /** Array of cases in the current page */
  cases: Case[];
  /** Total number of cases matching the query */
  total: number;
  /** Current page number (0-based) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Indicates if more pages are available */
  hasMore: boolean;
}