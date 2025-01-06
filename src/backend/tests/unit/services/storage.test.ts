/**
 * @file Unit tests for secure evidence storage service
 * @version 1.0.0
 * @description Comprehensive tests for FedRAMP High and CJIS compliant storage functionality
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // v29.6.2
import * as AWS from 'aws-sdk-mock'; // v5.8.0
import { BlobServiceClient } from '@azure/storage-blob'; // v12.17.0
import { StorageService } from '../../../src/storage-service/src/services/storage.service';
import { 
  StorageProviderType,
  StorageClass,
  IStorageItem,
  IStorageOperation,
  IRetentionPolicy
} from '../../../src/storage-service/src/interfaces/storage.interface';
import { storageConfig } from '../../../src/storage-service/src/config/storage.config';

// Test constants
const TEST_DATA = {
  EVIDENCE_ID: 'test-evidence-123',
  EVIDENCE_CONTENT: Buffer.from('test-evidence-content'),
  EVIDENCE_METADATA: {
    id: 'test-evidence-123',
    key: 'cases/2024/01/test-evidence-123',
    size: 1024,
    hash: 'sha256-test-hash',
    storageClass: StorageClass.HOT,
    retentionPeriod: 365,
    encryptionMetadata: {
      algorithm: 'AES-256-GCM',
      keyId: 'test-kms-key-id',
      kmsArn: 'arn:aws:kms:region:account:key/test-key',
      keyRotationPeriod: 90,
      hsmEnabled: true
    },
    chainOfCustody: []
  }
};

describe('StorageService', () => {
  let storageService: StorageService;
  let mockS3Client: AWS.S3;
  let mockBlobClient: BlobServiceClient;

  beforeEach(() => {
    // Mock AWS S3 client with WORM support
    AWS.mock('S3', 'putObject', (params: any, callback: Function) => {
      callback(null, {
        ETag: 'test-etag',
        VersionId: 'test-version-1',
        ObjectLockRetainUntilDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });
    });

    AWS.mock('S3', 'getObject', (params: any, callback: Function) => {
      callback(null, {
        Body: TEST_DATA.EVIDENCE_CONTENT,
        Metadata: {
          'x-amz-key-id': TEST_DATA.EVIDENCE_METADATA.encryptionMetadata.keyId,
          'x-amz-iv': 'test-iv',
          'x-amz-tag': 'test-tag'
        }
      });
    });

    // Mock Azure Blob client with replication status
    jest.mock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: jest.fn().mockReturnValue({
          getContainerClient: jest.fn().mockReturnValue({
            getBlockBlobClient: jest.fn().mockReturnValue({
              upload: jest.fn().mockResolvedValue({ etag: 'test-etag' }),
              getProperties: jest.fn().mockResolvedValue({
                metadata: {
                  replicationStatus: 'complete',
                  lastSyncTime: new Date().toISOString()
                }
              })
            })
          })
        })
      }
    }));

    // Initialize storage service
    storageService = new StorageService();
  });

  afterEach(() => {
    AWS.restore('S3');
    jest.clearAllMocks();
  });

  describe('uploadEvidence', () => {
    it('should upload evidence with encryption and WORM compliance', async () => {
      const operation = await storageService.uploadEvidence(
        TEST_DATA.EVIDENCE_CONTENT,
        TEST_DATA.EVIDENCE_METADATA
      );

      expect(operation.status).toBe('COMPLETED');
      expect(operation.item.id).toBe(TEST_DATA.EVIDENCE_ID);
      expect(operation.item.storageClass).toBe(StorageClass.HOT);
    });

    it('should enforce retention policy during upload', async () => {
      const operation = await storageService.uploadEvidence(
        TEST_DATA.EVIDENCE_CONTENT,
        {
          ...TEST_DATA.EVIDENCE_METADATA,
          retentionPeriod: 730 // 2 years
        }
      );

      expect(operation.status).toBe('COMPLETED');
      expect(operation.item.retentionPeriod).toBe(730);
    });

    it('should fail upload with invalid encryption parameters', async () => {
      const invalidMetadata = {
        ...TEST_DATA.EVIDENCE_METADATA,
        encryptionMetadata: {
          ...TEST_DATA.EVIDENCE_METADATA.encryptionMetadata,
          keyId: ''
        }
      };

      await expect(
        storageService.uploadEvidence(TEST_DATA.EVIDENCE_CONTENT, invalidMetadata)
      ).rejects.toThrow('Invalid encryption configuration');
    });
  });

  describe('downloadEvidence', () => {
    it('should download and decrypt evidence with integrity verification', async () => {
      const data = await storageService.downloadEvidence(TEST_DATA.EVIDENCE_ID);

      expect(Buffer.isBuffer(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should fail download with invalid integrity check', async () => {
      AWS.remock('S3', 'getObject', (params: any, callback: Function) => {
        callback(null, {
          Body: Buffer.from('tampered-content'),
          Metadata: {
            'x-amz-key-id': TEST_DATA.EVIDENCE_METADATA.encryptionMetadata.keyId,
            'x-amz-iv': 'test-iv',
            'x-amz-tag': 'invalid-tag'
          }
        });
      });

      await expect(
        storageService.downloadEvidence(TEST_DATA.EVIDENCE_ID)
      ).rejects.toThrow('Evidence integrity verification failed');
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify evidence integrity across storage providers', async () => {
      const isValid = await storageService.verifyIntegrity(TEST_DATA.EVIDENCE_ID);
      expect(isValid).toBe(true);
    });

    it('should detect evidence tampering', async () => {
      AWS.remock('S3', 'getObject', (params: any, callback: Function) => {
        callback(null, {
          Body: Buffer.from('tampered-content'),
          Metadata: { hash: 'different-hash' }
        });
      });

      const isValid = await storageService.verifyIntegrity(TEST_DATA.EVIDENCE_ID);
      expect(isValid).toBe(false);
    });
  });

  describe('checkReplicationStatus', () => {
    it('should verify cross-region replication status', async () => {
      const status = await storageService.checkReplicationStatus(TEST_DATA.EVIDENCE_ID);

      expect(status.isReplicated).toBe(true);
      expect(status.lastSyncTime).toBeDefined();
      expect(status.targetRegion).toBe(storageConfig.backupStorage.region);
    });

    it('should handle replication failures', async () => {
      jest.spyOn(BlobServiceClient.prototype, 'getProperties').mockRejectedValue(
        new Error('Replication failed')
      );

      const status = await storageService.checkReplicationStatus(TEST_DATA.EVIDENCE_ID);
      expect(status.isReplicated).toBe(false);
      expect(status.error).toBeDefined();
    });
  });

  describe('getStorageMetrics', () => {
    it('should return comprehensive storage metrics', async () => {
      const metrics = await storageService.getStorageMetrics();

      expect(metrics.primaryStorage).toBeDefined();
      expect(metrics.backupStorage).toBeDefined();
      expect(metrics.replicationLag).toBeDefined();
      expect(metrics.encryptionStatus).toBeDefined();
    });

    it('should track WORM compliance metrics', async () => {
      const metrics = await storageService.getStorageMetrics();

      expect(metrics.wormCompliance).toBeDefined();
      expect(metrics.wormCompliance.totalObjects).toBeGreaterThan(0);
      expect(metrics.wormCompliance.retentionViolations).toBe(0);
    });
  });

  describe('getEvidenceMetadata', () => {
    it('should retrieve complete evidence metadata with chain of custody', async () => {
      const metadata = await storageService.getEvidenceMetadata(TEST_DATA.EVIDENCE_ID);

      expect(metadata.id).toBe(TEST_DATA.EVIDENCE_ID);
      expect(metadata.chainOfCustody).toBeDefined();
      expect(metadata.encryptionMetadata).toBeDefined();
    });

    it('should validate retention policy compliance', async () => {
      const metadata = await storageService.getEvidenceMetadata(TEST_DATA.EVIDENCE_ID);

      expect(metadata.retentionPeriod).toBeGreaterThanOrEqual(
        storageConfig.wormConfig.minRetentionDays
      );
    });
  });
});