/**
 * TypeScript type definitions for evidence-related data structures in the CrimeMiner web application.
 * Implements FedRAMP High and CJIS compliance requirements for evidence handling and tracking.
 * @version 1.0.0
 */

import { BaseEntity, ApiResponse, PaginatedResponse } from '../types/common.types';

/**
 * Enum defining supported evidence media types
 */
export enum EvidenceMediaType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT'
}

/**
 * Enum defining evidence processing status states
 */
export enum EvidenceStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Enum defining FedRAMP security classification levels
 */
export enum SecurityClassification {
  UNCLASSIFIED = 'UNCLASSIFIED',
  SENSITIVE = 'SENSITIVE',
  CONFIDENTIAL = 'CONFIDENTIAL',
  SECRET = 'SECRET'
}

/**
 * Interface for evidence retention policy requirements
 */
export interface RetentionPolicy {
  /** Duration in days for evidence retention */
  retentionPeriod: number;
  
  /** Date when evidence should be disposed */
  retentionEndDate: Date;
  
  /** Justification for retention period */
  retentionJustification: string;
  
  /** Instructions for evidence disposition */
  dispositionInstructions: string;
}

/**
 * Interface for CJIS security controls
 */
export interface SecurityControl {
  /** Unique identifier for the security control */
  controlId: string;
  
  /** Type of security control */
  controlType: string;
  
  /** Current implementation status */
  implementationStatus: string;
  
  /** Date of last security assessment */
  lastAssessmentDate: Date;
}

/**
 * Interface for device information in access logs
 */
export interface DeviceInfo {
  /** Browser/client user agent string */
  userAgent: string;
  
  /** Unique device identifier */
  deviceId: string;
  
  /** Type of device used for access */
  deviceType: string;
}

/**
 * Interface for geographic location tracking
 */
export interface GeoLocation {
  /** Latitude coordinate */
  latitude: number;
  
  /** Longitude coordinate */
  longitude: number;
  
  /** Location accuracy in meters */
  accuracy: number;
}

/**
 * Interface for comprehensive access logging
 */
export interface AccessLog {
  /** Timestamp of access event */
  timestamp: Date;
  
  /** ID of user accessing evidence */
  userId: string;
  
  /** Type of action performed */
  action: string;
  
  /** IP address of accessing device */
  ipAddress: string;
  
  /** Detailed device information */
  deviceInfo: DeviceInfo;
  
  /** Geographic location data */
  geoLocation: GeoLocation;
}

/**
 * Interface for chain of custody entry
 */
export interface ChainOfCustodyEntry {
  /** Timestamp of custody transfer */
  timestamp: Date;
  
  /** ID of user transferring custody */
  fromUserId: string;
  
  /** ID of user receiving custody */
  toUserId: string;
  
  /** Reason for custody transfer */
  reason: string;
  
  /** Digital signature of transfer */
  signature: string;
  
  /** Location where transfer occurred */
  location: GeoLocation;
}

/**
 * Interface for evidence metadata
 */
export interface EvidenceMetadata {
  /** Original filename */
  originalFilename: string;
  
  /** File size in bytes */
  fileSize: number;
  
  /** File MIME type */
  mimeType: string;
  
  /** Duration for audio/video */
  duration?: number;
  
  /** Resolution for image/video */
  resolution?: {
    width: number;
    height: number;
  };
  
  /** Additional custom metadata */
  customMetadata: Record<string, unknown>;
}

/**
 * Main evidence entity interface with enhanced security and compliance features
 */
export interface Evidence extends BaseEntity {
  /** Associated case identifier */
  caseId: string;
  
  /** Type of media evidence */
  mediaType: EvidenceMediaType;
  
  /** Secure storage file path */
  filePath: string;
  
  /** Cryptographic hash of file */
  fileHash: string;
  
  /** Current processing status */
  status: EvidenceStatus;
  
  /** Detailed evidence metadata */
  metadata: EvidenceMetadata;
  
  /** Security classification level */
  classificationLevel: SecurityClassification;
  
  /** Applied security controls */
  securityControls: SecurityControl[];
  
  /** Evidence retention policy */
  retentionPolicy: RetentionPolicy;
  
  /** History of access events */
  accessHistory: AccessLog[];
  
  /** Chain of custody log */
  chainOfCustody: ChainOfCustodyEntry[];
}

/**
 * Type for paginated evidence response
 */
export type PaginatedEvidenceResponse = PaginatedResponse<Evidence>;

/**
 * Type for evidence API response
 */
export type EvidenceApiResponse = ApiResponse<Evidence>;