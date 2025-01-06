/**
 * @file Storage service configuration with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Implements secure evidence storage configuration with multi-cloud support,
 * tiered storage, encryption, and WORM capabilities
 */

import { config } from 'dotenv'; // v16.3.1
import {
  IStorageProvider,
  StorageProviderType,
  StorageClass,
  IStorageEncryption,
  IStorageReplication,
  IWORMConfig,
  IChainOfCustody
} from '../interfaces/storage.interface';

// Load environment configuration
config();

// Storage retention periods
const STORAGE_RETENTION_PERIODS = {
  HOT_STORAGE_DAYS: 30,
  WARM_STORAGE_DAYS: 90,
  COLD_STORAGE_YEARS: 7
} as const;

// WORM compliance configuration
const WORM_RETENTION_POLICY = {
  ENABLED: true,
  MIN_RETENTION_DAYS: 365,
  MAX_RETENTION_YEARS: 10,
  LEGAL_HOLD_ENABLED: true,
  COMPLIANCE_MODE: 'STRICT'
} as const;

// Encryption configuration with HSM support
const ENCRYPTION_CONFIG = {
  ALGORITHM: 'AES-256-GCM',
  KEY_ROTATION_DAYS: 90,
  HSM_ENABLED: true,
  KMS_KEY_ID: process.env.KMS_KEY_ID
} as const;

/**
 * Validates storage configuration completeness and compliance
 * @param config Storage configuration object
 * @returns boolean indicating validation status
 */
export const validateStorageConfig = (config: any): boolean => {
  try {
    // Validate required environment variables
    if (!process.env.KMS_KEY_ID || !process.env.AWS_S3_BUCKET || !process.env.AZURE_STORAGE_ACCOUNT) {
      throw new Error('Missing required environment variables');
    }

    // Validate storage provider settings
    if (!config.primaryStorage || !config.backupStorage) {
      throw new Error('Missing storage provider configuration');
    }

    // Validate HSM and encryption configuration
    if (!config.encryption || !config.encryption.keyId) {
      throw new Error('Invalid encryption configuration');
    }

    // Validate WORM and retention policies
    if (!config.wormConfig || !config.retentionPolicies) {
      throw new Error('Missing WORM or retention configuration');
    }

    // Validate replication settings
    if (!config.replication || !config.replication.targetRegion) {
      throw new Error('Invalid replication configuration');
    }

    return true;
  } catch (error) {
    console.error('Storage configuration validation failed:', error);
    return false;
  }
};

// Primary storage provider configuration (AWS S3)
const primaryStorage: IStorageProvider = {
  type: StorageProviderType.AWS_S3,
  region: process.env.AWS_REGION || 'us-gov-west-1',
  bucket: process.env.AWS_S3_BUCKET!,
  storageClass: StorageClass.HOT,
  encryption: {
    algorithm: ENCRYPTION_CONFIG.ALGORITHM,
    keyId: ENCRYPTION_CONFIG.KMS_KEY_ID!,
    kmsArn: process.env.AWS_KMS_ARN!,
    keyRotationPeriod: ENCRYPTION_CONFIG.KEY_ROTATION_DAYS,
    hsmEnabled: ENCRYPTION_CONFIG.HSM_ENABLED
  },
  replicationConfig: {
    enabled: true,
    targetRegion: process.env.AWS_BACKUP_REGION || 'us-gov-east-1',
    targetProvider: StorageProviderType.AWS_S3,
    syncFrequency: 15 // 15 minutes
  },
  wormConfig: {
    enabled: WORM_RETENTION_POLICY.ENABLED,
    retentionPeriod: WORM_RETENTION_POLICY.MIN_RETENTION_DAYS,
    legalHoldEnabled: WORM_RETENTION_POLICY.LEGAL_HOLD_ENABLED
  }
};

// Backup storage provider configuration (Azure Blob)
const backupStorage: IStorageProvider = {
  type: StorageProviderType.AZURE_BLOB,
  region: process.env.AZURE_REGION || 'usgovvirginia',
  bucket: process.env.AZURE_CONTAINER!,
  storageClass: StorageClass.COLD,
  encryption: {
    algorithm: ENCRYPTION_CONFIG.ALGORITHM,
    keyId: process.env.AZURE_KEY_VAULT_KEY_ID!,
    kmsArn: process.env.AZURE_KEY_VAULT_URI!,
    keyRotationPeriod: ENCRYPTION_CONFIG.KEY_ROTATION_DAYS,
    hsmEnabled: ENCRYPTION_CONFIG.HSM_ENABLED
  },
  replicationConfig: {
    enabled: true,
    targetRegion: process.env.AZURE_BACKUP_REGION || 'usgovtexas',
    targetProvider: StorageProviderType.AZURE_BLOB,
    syncFrequency: 30 // 30 minutes
  },
  wormConfig: {
    enabled: WORM_RETENTION_POLICY.ENABLED,
    retentionPeriod: WORM_RETENTION_POLICY.MIN_RETENTION_DAYS,
    legalHoldEnabled: WORM_RETENTION_POLICY.LEGAL_HOLD_ENABLED
  }
};

// Comprehensive storage configuration export
export const storageConfig = {
  primaryStorage,
  backupStorage,
  encryption: {
    algorithm: ENCRYPTION_CONFIG.ALGORITHM,
    keyRotationPeriod: ENCRYPTION_CONFIG.KEY_ROTATION_DAYS,
    hsmEnabled: ENCRYPTION_CONFIG.HSM_ENABLED
  },
  replication: {
    enabled: true,
    crossCloud: true,
    syncFrequency: 30 // minutes
  },
  wormConfig: {
    enabled: WORM_RETENTION_POLICY.ENABLED,
    minRetentionDays: WORM_RETENTION_POLICY.MIN_RETENTION_DAYS,
    maxRetentionYears: WORM_RETENTION_POLICY.MAX_RETENTION_YEARS,
    legalHoldEnabled: WORM_RETENTION_POLICY.LEGAL_HOLD_ENABLED,
    complianceMode: WORM_RETENTION_POLICY.COMPLIANCE_MODE
  },
  chainOfCustody: {
    enabled: true,
    hashAlgorithm: 'SHA-256',
    signatureRequired: true,
    auditFrequency: 24 // hours
  },
  retentionPolicies: {
    hotStorage: {
      days: STORAGE_RETENTION_PERIODS.HOT_STORAGE_DAYS,
      storageClass: StorageClass.HOT
    },
    warmStorage: {
      days: STORAGE_RETENTION_PERIODS.WARM_STORAGE_DAYS,
      storageClass: StorageClass.WARM
    },
    coldStorage: {
      years: STORAGE_RETENTION_PERIODS.COLD_STORAGE_YEARS,
      storageClass: StorageClass.COLD
    }
  }
};

// Validate configuration on module load
validateStorageConfig(storageConfig);