/**
 * Core TypeScript type definitions and interfaces for the CrimeMiner web application.
 * Implements FedRAMP High and CJIS compliance requirements for type safety and security.
 * @version 1.0.0
 */

/**
 * Base interface for all entity types with enhanced security and audit fields.
 * Implements FedRAMP and CJIS compliance requirements for data classification
 * and access tracking.
 */
export interface BaseEntity {
  /** Unique identifier for the entity */
  id: string;
  
  /** Timestamp when entity was created */
  createdAt: Date;
  
  /** Timestamp when entity was last updated */
  updatedAt: Date;
  
  /** ID of user who created the entity */
  createdBy: string;
  
  /** Security classification level per CJIS requirements */
  classificationLevel: string;
  
  /** ID of user who last accessed the entity */
  lastAccessedBy: string;
  
  /** Timestamp of last access */
  lastAccessedAt: Date;
  
  /** Additional metadata as key-value pairs */
  metadata: Record<string, unknown>;
}

/**
 * Generic interface for standardized API responses with security tracing.
 * Implements FedRAMP requirements for request tracking and error handling.
 */
export interface ApiResponse<T> {
  /** Indicates if the request was successful */
  success: boolean;
  
  /** Response payload of generic type T */
  data: T;
  
  /** Error details if success is false */
  error: ApiError;
  
  /** Response timestamp for audit tracking */
  timestamp: Date;
  
  /** Unique request identifier for tracing */
  requestId: string;
}

/**
 * Interface for standardized error responses with severity levels
 * and correlation tracking for security incidents.
 */
export interface ApiError {
  /** Error code identifier */
  code: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Additional error context */
  details: Record<string, any>;
  
  /** Request identifier for tracing */
  requestId: string;
  
  /** Error severity level for incident response */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  /** Error timestamp */
  timestamp: Date;
  
  /** Correlation ID for tracking related errors */
  correlationId: string;
}

/**
 * Generic interface for paginated API responses with cursor-based pagination
 * for efficient data retrieval of large datasets.
 */
export interface PaginatedResponse<T> {
  /** Array of items of generic type T */
  items: T[];
  
  /** Total number of available items */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of items per page */
  limit: number;
  
  /** Indicates if more items are available */
  hasMore: boolean;
  
  /** Cursor for retrieving next page */
  nextCursor: string;
}

/**
 * Interface for comprehensive audit logging with security tracking
 * to meet FedRAMP and CJIS compliance requirements.
 */
export interface AuditLog {
  /** Timestamp of the audited action */
  timestamp: Date;
  
  /** ID of user who performed the action */
  userId: string;
  
  /** Type of action performed */
  action: string;
  
  /** Type of entity affected */
  entityType: string;
  
  /** ID of affected entity */
  entityId: string;
  
  /** Record of changes made */
  changes: Record<string, any>;
  
  /** IP address of the user */
  ipAddress: string;
  
  /** User agent string */
  userAgent: string;
  
  /** Session identifier */
  sessionId: string;
}