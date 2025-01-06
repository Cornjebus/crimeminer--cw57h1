/**
 * @file Core interface definitions for secure evidence storage service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant storage interfaces with
 * multi-cloud support, encryption, and WORM compliance capabilities
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';

/**
 * Supported cloud storage provider types
 */
export enum StorageProviderType {
  AWS_S3 = 'AWS_S3',
  AZURE_BLOB = 'AZURE_BLOB'
}

/**
 * Storage tier classifications for cost optimization
 */
export enum StorageClass {
  HOT = 'HOT',      // Frequently accessed data (< 30 days)
  WARM = 'WARM',    // Infrequently accessed data (30-90 days)
  COLD = 'COLD'     // Rarely accessed data (90+ days)
}

/**
 * Enhanced encryption configuration with HSM support
 */
export interface IStorageEncryption {
  algorithm: string;           // e.g., 'AES-256-GCM'
  keyId: string;              // KMS key identifier
  kmsArn: string;             // AWS KMS or Azure Key Vault ARN
  keyRotationPeriod: number;  // Key rotation period in days
  hsmEnabled: boolean;        // Hardware Security Module enabled flag
}

/**
 * Cross-region and cross-cloud replication configuration
 */
export interface IStorageReplication {
  enabled: boolean;
  targetRegion: string;
  targetProvider: StorageProviderType;
  syncFrequency: number;      // Sync frequency in minutes
}

/**
 * WORM (Write Once Read Many) compliance configuration
 */
export interface IWORMConfig {
  enabled: boolean;
  retentionPeriod: number;    // Retention period in days
  legalHoldEnabled: boolean;  // Legal hold override flag
}

/**
 * Comprehensive storage provider configuration interface
 */
export interface IStorageProvider {
  type: StorageProviderType;
  region: string;
  bucket: string;
  storageClass: StorageClass;
  encryption: IStorageEncryption;
  replicationConfig: IStorageReplication;
  wormConfig: IWORMConfig;
}

/**
 * Chain of custody tracking for evidence items
 */
export interface IChainOfCustody {
  action: string;             // e.g., 'UPLOAD', 'ACCESS', 'MODIFY'
  timestamp: Date;
  userId: string;
  reason: string;
}

/**
 * Enhanced storage item interface with encryption and chain of custody
 */
export interface IStorageItem extends IBaseEntity {
  key: string;               // Unique storage key/path
  size: number;              // File size in bytes
  hash: string;              // SHA-256 hash of content
  storageClass: StorageClass;
  retentionPeriod: number;   // Retention period in days
  encryptionMetadata: IStorageEncryption;
  chainOfCustody: IChainOfCustody[];
}

/**
 * Comprehensive storage operation tracking
 */
export interface IStorageOperation {
  operation: string;         // e.g., 'UPLOAD', 'DOWNLOAD', 'DELETE'
  status: string;           // e.g., 'PENDING', 'COMPLETED', 'FAILED'
  item: IStorageItem;
  timestamp: Date;
  error?: string;
  retryCount: number;
}