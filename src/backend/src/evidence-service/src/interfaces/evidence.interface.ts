/**
 * @file Core interface definitions for evidence entities in CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP and CJIS compliant data structures for evidence handling,
 * chain of custody tracking, and WORM storage compliance
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';

/**
 * Supported evidence media types in compliance with system requirements
 */
export enum EvidenceMediaType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT'
}

/**
 * Evidence processing status states including security quarantine
 */
export enum EvidenceStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  QUARANTINED = 'QUARANTINED'
}

/**
 * Enhanced metadata interface for evidence files with security features
 */
export interface IEvidenceMetadata {
  fileSize: number;
  mimeType: string;
  duration?: number; // For audio/video
  dimensions?: {
    width: number;
    height: number;
  };
  encoding: string;
  securityHash: string; // SHA-512 hash of file content
  encryptionMetadata: {
    algorithm: string; // e.g. 'AES-256-GCM'
    keyId: string; // Reference to encryption key in KMS
    iv: string; // Initialization vector
  };
}

/**
 * Enhanced chain of custody entry with security and compliance tracking
 */
export interface IChainOfCustodyEntry {
  timestamp: Date;
  action: string;
  userId: string;
  details: Record<string, any>;
  digitalSignature: string; // Cryptographic signature of entry
  complianceMetadata: {
    standard: string; // e.g. 'CJIS', 'FedRAMP'
    controls: string[]; // Applicable compliance controls
  };
}

/**
 * Main evidence interface with enhanced security, compliance and WORM features
 * Extends IBaseEntity for audit trail capabilities
 */
export interface IEvidence extends IBaseEntity {
  caseId: string;
  mediaType: EvidenceMediaType;
  filePath: string;
  fileHash: string; // Cryptographic hash for integrity verification
  status: EvidenceStatus;
  metadata: IEvidenceMetadata;
  chainOfCustody: IChainOfCustodyEntry[];
  
  // WORM (Write Once Read Many) compliance tracking
  wormCompliance: {
    retentionPeriod: number; // Retention period in days
    lockStatus: boolean; // Indicates if evidence is locked
    policyId: string; // Reference to retention policy
  };

  // Integrity verification metadata
  integrityVerification: {
    lastVerified: Date;
    status: string;
    verificationHash: string; // Latest integrity check hash
  };
}