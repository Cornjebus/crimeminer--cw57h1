/**
 * @file Core storage service implementation with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Implements secure evidence storage with multi-cloud support, WORM compliance,
 * and comprehensive audit logging capabilities
 */

import { S3 } from 'aws-sdk'; // v2.1450.0
import { BlobServiceClient } from '@azure/storage-blob'; // v12.17.0
import {
  IStorageProvider,
  StorageProviderType,
  StorageClass,
  IStorageItem,
  IStorageOperation,
  IStorageEncryption,
  IStorageAudit,
  IStorageMonitoring
} from '../interfaces/storage.interface';
import { storageConfig } from '../config/storage.config';
import { encrypt, decrypt, verifyIntegrity } from '../../../common/utils/encryption.util';
import { Logger } from '../../../common/utils/logger.util';

// Error codes for storage operations
const STORAGE_ERRORS = {
  UPLOAD_FAILED: 'STORAGE_001',
  DOWNLOAD_FAILED: 'STORAGE_002',
  DELETE_FAILED: 'STORAGE_003',
  METADATA_FAILED: 'STORAGE_004',
  INTEGRITY_FAILED: 'STORAGE_005',
  REPLICATION_FAILED: 'STORAGE_006',
  AUDIT_FAILED: 'STORAGE_007'
};

/**
 * Enhanced storage service with FedRAMP and CJIS compliance
 */
export class StorageService {
  private primaryClient: S3;
  private backupClient: BlobServiceClient;
  private logger: Logger;
  private monitor: IStorageMonitoring;
  private auditTrail: IStorageAudit;

  constructor() {
    // Initialize enhanced logger
    this.logger = new Logger('StorageService', {
      level: 'info',
      filepath: 'logs/storage-%DATE%.log',
      encryptionKey: process.env.LOG_ENCRYPTION_KEY
    });

    // Initialize AWS S3 client with retry policies
    this.primaryClient = new S3({
      region: storageConfig.primaryStorage.region,
      maxRetries: 3,
      retryDelayOptions: { base: 100 },
      httpOptions: { timeout: 5000 }
    });

    // Initialize Azure Blob client with failover settings
    this.backupClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!,
      {
        retryOptions: { maxTries: 3 },
        keepAliveOptions: { enable: true }
      }
    );

    // Initialize monitoring and audit systems
    this.initializeMonitoring();
    this.initializeAuditTrail();
  }

  /**
   * Initialize storage monitoring system
   */
  private initializeMonitoring(): void {
    this.monitor = {
      metrics: new Map(),
      alerts: new Set(),
      status: 'healthy',
      lastCheck: new Date()
    };
  }

  /**
   * Initialize audit trail system
   */
  private initializeAuditTrail(): void {
    this.auditTrail = {
      entries: new Map(),
      lastSync: new Date(),
      verificationHash: ''
    };
  }

  /**
   * Upload evidence with encryption and WORM compliance
   */
  public async uploadEvidence(
    data: Buffer,
    metadata: IStorageItem
  ): Promise<IStorageOperation> {
    const operation: IStorageOperation = {
      operation: 'UPLOAD',
      status: 'PENDING',
      item: metadata,
      timestamp: new Date(),
      retryCount: 0
    };

    try {
      // Generate audit trail entry
      const auditEntry = this.createAuditEntry('UPLOAD', metadata);

      // Encrypt evidence with integrity verification
      const encryptedData = await encrypt(
        data,
        storageConfig.primaryStorage.encryption.keyId,
        { evidenceId: metadata.id }
      );

      // Upload to primary storage with WORM settings
      const primaryUpload = await this.primaryClient.putObject({
        Bucket: storageConfig.primaryStorage.bucket,
        Key: metadata.key,
        Body: encryptedData.encryptedData,
        Metadata: {
          iv: encryptedData.iv.toString('base64'),
          tag: encryptedData.tag.toString('base64'),
          keyVersion: encryptedData.keyVersion,
          hash: metadata.hash,
          storageClass: metadata.storageClass
        },
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: this.calculateRetentionDate(metadata)
      }).promise();

      // Verify upload integrity
      const integrityCheck = await this.verifyStorageIntegrity(metadata.id);
      if (!integrityCheck) {
        throw new Error('Primary storage integrity verification failed');
      }

      // Replicate to backup storage
      await this.replicateToBackup(metadata, encryptedData);

      // Update audit trail and monitoring metrics
      this.updateAuditTrail(auditEntry);
      this.updateMetrics('upload', true);

      operation.status = 'COMPLETED';
      return operation;

    } catch (error) {
      this.logger.error('Upload failed', error, {
        evidenceId: metadata.id,
        errorCode: STORAGE_ERRORS.UPLOAD_FAILED
      });

      operation.status = 'FAILED';
      operation.error = error.message;
      throw error;
    }
  }

  /**
   * Download evidence with decryption and integrity verification
   */
  public async downloadEvidence(evidenceId: string): Promise<Buffer> {
    try {
      // Get evidence metadata
      const metadata = await this.getEvidenceMetadata(evidenceId);

      // Create audit entry
      const auditEntry = this.createAuditEntry('DOWNLOAD', metadata);

      // Download from primary storage
      const result = await this.primaryClient.getObject({
        Bucket: storageConfig.primaryStorage.bucket,
        Key: metadata.key
      }).promise();

      // Verify integrity before decryption
      const integrityCheck = await this.verifyStorageIntegrity(evidenceId);
      if (!integrityCheck) {
        throw new Error('Evidence integrity verification failed');
      }

      // Decrypt evidence
      const decryptedData = await decrypt(
        Buffer.from(result.Body as Buffer),
        Buffer.from(result.Metadata!.iv, 'base64'),
        Buffer.from(result.Metadata!.tag, 'base64'),
        storageConfig.primaryStorage.encryption.keyId,
        result.Metadata!.keyVersion,
        { evidenceId }
      );

      // Update audit trail
      this.updateAuditTrail(auditEntry);

      return decryptedData;

    } catch (error) {
      this.logger.error('Download failed', error, {
        evidenceId,
        errorCode: STORAGE_ERRORS.DOWNLOAD_FAILED
      });
      throw error;
    }
  }

  /**
   * Verify storage integrity across providers
   */
  public async verifyStorageIntegrity(evidenceId: string): Promise<boolean> {
    try {
      // Get metadata from both storage providers
      const primaryMetadata = await this.getEvidenceMetadata(evidenceId);
      const backupMetadata = await this.getBackupMetadata(evidenceId);

      // Compare hashes
      const primaryHash = primaryMetadata.hash;
      const backupHash = backupMetadata.hash;

      // Verify integrity
      const integrityValid = primaryHash === backupHash;

      // Update monitoring metrics
      this.updateMetrics('integrity', integrityValid);

      return integrityValid;

    } catch (error) {
      this.logger.error('Integrity check failed', error, {
        evidenceId,
        errorCode: STORAGE_ERRORS.INTEGRITY_FAILED
      });
      return false;
    }
  }

  /**
   * Get storage system metrics
   */
  public async getStorageMetrics(): Promise<IStorageMonitoring> {
    try {
      // Collect metrics from primary storage
      const primaryMetrics = await this.getPrimaryStorageMetrics();

      // Collect metrics from backup storage
      const backupMetrics = await this.getBackupStorageMetrics();

      // Calculate replication lag
      const replicationLag = this.calculateReplicationLag();

      // Update monitoring status
      this.monitor.metrics.set('primaryHealth', primaryMetrics);
      this.monitor.metrics.set('backupHealth', backupMetrics);
      this.monitor.metrics.set('replicationLag', replicationLag);
      this.monitor.lastCheck = new Date();

      return this.monitor;

    } catch (error) {
      this.logger.error('Failed to collect storage metrics', error);
      throw error;
    }
  }

  /**
   * Helper method to replicate evidence to backup storage
   */
  private async replicateToBackup(
    metadata: IStorageItem,
    encryptedData: any
  ): Promise<void> {
    try {
      const containerClient = this.backupClient.getContainerClient(
        storageConfig.backupStorage.bucket
      );

      const blockBlobClient = containerClient.getBlockBlobClient(metadata.key);

      await blockBlobClient.upload(encryptedData.encryptedData, 
        encryptedData.encryptedData.length, {
        metadata: {
          iv: encryptedData.iv.toString('base64'),
          tag: encryptedData.tag.toString('base64'),
          keyVersion: encryptedData.keyVersion,
          hash: metadata.hash,
          storageClass: metadata.storageClass
        },
        blobHTTPHeaders: {
          blobContentType: 'application/octet-stream'
        }
      });

    } catch (error) {
      this.logger.error('Backup replication failed', error, {
        evidenceId: metadata.id,
        errorCode: STORAGE_ERRORS.REPLICATION_FAILED
      });
      throw error;
    }
  }

  /**
   * Helper method to calculate retention date based on storage class
   */
  private calculateRetentionDate(metadata: IStorageItem): Date {
    const now = new Date();
    switch (metadata.storageClass) {
      case StorageClass.HOT:
        return new Date(now.setDate(now.getDate() + 30));
      case StorageClass.WARM:
        return new Date(now.setDate(now.getDate() + 90));
      case StorageClass.COLD:
        return new Date(now.setFullYear(now.getFullYear() + 7));
      default:
        return new Date(now.setFullYear(now.getFullYear() + 1));
    }
  }

  /**
   * Helper method to create audit trail entry
   */
  private createAuditEntry(
    action: string,
    metadata: IStorageItem
  ): IStorageAudit {
    return {
      timestamp: new Date(),
      action,
      evidenceId: metadata.id,
      userId: process.env.CURRENT_USER_ID!,
      storageClass: metadata.storageClass,
      verificationHash: metadata.hash
    };
  }

  /**
   * Helper method to update metrics
   */
  private updateMetrics(operation: string, success: boolean): void {
    const metrics = this.monitor.metrics.get(operation) || { success: 0, failed: 0 };
    if (success) {
      metrics.success++;
    } else {
      metrics.failed++;
    }
    this.monitor.metrics.set(operation, metrics);
  }
}