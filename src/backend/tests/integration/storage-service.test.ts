/**
 * @file Integration tests for secure evidence storage service
 * @version 1.0.0
 * @description Verifies FedRAMP High and CJIS compliant storage functionality including
 * encryption, WORM compliance, multi-cloud replication, and chain of custody tracking
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals'; // v29.6.0
import { faker } from '@faker-js/faker'; // v8.0.0
import MockS3 from 'mock-aws-s3'; // v4.0.2
import { BlobServiceClient } from '@azure/storage-blob'; // v12.14.0
import { StorageService } from '../../src/storage-service/src/services/storage.service';
import {
  StorageProviderType,
  StorageClass,
  IStorageItem,
  IStorageOperation,
  IChainOfCustody
} from '../../src/storage-service/src/interfaces/storage.interface';

// Test configuration
const TEST_CONFIG = {
  primaryBucket: 'test-evidence-bucket',
  backupBucket: 'test-backup-bucket',
  kmsKeyId: 'test-kms-key-id',
  retentionPeriod: 365,
  testFileSize: 1024 * 1024 // 1MB
};

// Global test variables
let storageService: StorageService;
let testData: Map<string, Buffer>;
let mockS3: any;
let mockAzureBlob: BlobServiceClient;
let testEncryptionKeys: Map<string, Buffer>;

describe('Storage Service Integration Tests', () => {
  beforeAll(async () => {
    // Initialize mock S3
    mockS3 = new MockS3({
      basePath: '/tmp/mock-s3',
      buckets: [TEST_CONFIG.primaryBucket]
    });

    // Initialize mock Azure Blob
    mockAzureBlob = BlobServiceClient.fromConnectionString(
      'UseDevelopmentStorage=true'
    );

    // Generate test encryption keys
    testEncryptionKeys = new Map([
      ['primary', Buffer.from(faker.string.alphanumeric(32))],
      ['backup', Buffer.from(faker.string.alphanumeric(32))]
    ]);

    // Initialize storage service with test configuration
    storageService = new StorageService();

    // Generate test data
    testData = new Map();
    for (let i = 0; i < 5; i++) {
      testData.set(
        faker.string.uuid(),
        Buffer.from(faker.string.alphanumeric(TEST_CONFIG.testFileSize))
      );
    }

    // Mock KMS and encryption services
    jest.spyOn(storageService as any, 'encrypt').mockImplementation(
      async (data: Buffer) => ({
        encryptedData: data,
        iv: Buffer.from(faker.string.alphanumeric(12)),
        tag: Buffer.from(faker.string.alphanumeric(16)),
        keyVersion: '1'
      })
    );
  });

  afterAll(async () => {
    // Clean up test data
    for (const [id] of testData) {
      await storageService.deleteEvidence(id);
    }

    // Clear mock storage
    await mockS3.clearBucket(TEST_CONFIG.primaryBucket);
    await mockS3.clearBucket(TEST_CONFIG.backupBucket);

    // Clear encryption keys
    testEncryptionKeys.clear();
    testData.clear();
  });

  describe('Evidence Upload Tests', () => {
    test('should upload evidence with encryption and WORM compliance', async () => {
      // Prepare test evidence
      const evidenceId = faker.string.uuid();
      const testBuffer = testData.get(evidenceId)!;
      
      const metadata: IStorageItem = {
        id: evidenceId,
        key: `evidence/${evidenceId}`,
        size: testBuffer.length,
        hash: faker.string.alphanumeric(64),
        storageClass: StorageClass.HOT,
        retentionPeriod: TEST_CONFIG.retentionPeriod,
        encryptionMetadata: {
          algorithm: 'AES-256-GCM',
          keyId: TEST_CONFIG.kmsKeyId,
          kmsArn: 'arn:aws:kms:test',
          keyRotationPeriod: 90,
          hsmEnabled: true
        },
        chainOfCustody: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        updatedBy: 'test-user',
        version: 1,
        auditLog: []
      };

      // Upload evidence
      const result = await storageService.uploadEvidence(testBuffer, metadata);

      // Verify upload success
      expect(result.status).toBe('COMPLETED');
      expect(result.operation).toBe('UPLOAD');
      expect(result.item.id).toBe(evidenceId);

      // Verify WORM compliance
      const storedMetadata = await storageService.getEvidenceMetadata(evidenceId);
      expect(storedMetadata.retentionPeriod).toBe(TEST_CONFIG.retentionPeriod);

      // Verify replication
      const replicationStatus = await verifyReplication(evidenceId);
      expect(replicationStatus).toBe(true);
    });

    test('should enforce encryption for all uploads', async () => {
      const evidenceId = faker.string.uuid();
      const testBuffer = testData.get(evidenceId)!;

      // Attempt upload without encryption
      await expect(
        storageService.uploadEvidence(testBuffer, {
          ...createTestMetadata(evidenceId),
          encryptionMetadata: undefined as any
        })
      ).rejects.toThrow();
    });
  });

  describe('Storage Tier Management Tests', () => {
    test('should transition evidence through storage tiers', async () => {
      const evidenceId = faker.string.uuid();
      const testBuffer = testData.get(evidenceId)!;
      
      // Upload to hot storage
      await storageService.uploadEvidence(
        testBuffer,
        createTestMetadata(evidenceId, StorageClass.HOT)
      );

      // Verify initial storage class
      let metadata = await storageService.getEvidenceMetadata(evidenceId);
      expect(metadata.storageClass).toBe(StorageClass.HOT);

      // Simulate time passage and transition to warm storage
      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // 31 days
      await storageService.transitionStorageTier(evidenceId, StorageClass.WARM);
      
      metadata = await storageService.getEvidenceMetadata(evidenceId);
      expect(metadata.storageClass).toBe(StorageClass.WARM);

      // Simulate time passage and transition to cold storage
      jest.advanceTimersByTime(91 * 24 * 60 * 60 * 1000); // 91 days
      await storageService.transitionStorageTier(evidenceId, StorageClass.COLD);
      
      metadata = await storageService.getEvidenceMetadata(evidenceId);
      expect(metadata.storageClass).toBe(StorageClass.COLD);
    });
  });

  describe('Chain of Custody Tests', () => {
    test('should maintain complete chain of custody', async () => {
      const evidenceId = faker.string.uuid();
      const testBuffer = testData.get(evidenceId)!;

      // Upload evidence
      await storageService.uploadEvidence(
        testBuffer,
        createTestMetadata(evidenceId)
      );

      // Perform multiple operations
      await storageService.downloadEvidence(evidenceId);
      await storageService.getEvidenceMetadata(evidenceId);
      await storageService.transitionStorageTier(evidenceId, StorageClass.WARM);

      // Verify chain of custody
      const custody = await storageService.getChainOfCustody(evidenceId);
      
      expect(custody.length).toBeGreaterThanOrEqual(4); // Upload + 3 operations
      expect(custody[0].action).toBe('UPLOAD');
      expect(custody[custody.length - 1].action).toBe('TIER_TRANSITION');

      // Verify digital signatures
      custody.forEach(event => {
        expect(event.verificationHash).toBeTruthy();
      });
    });
  });
});

/**
 * Helper function to create test metadata
 */
function createTestMetadata(
  evidenceId: string,
  storageClass: StorageClass = StorageClass.HOT
): IStorageItem {
  return {
    id: evidenceId,
    key: `evidence/${evidenceId}`,
    size: TEST_CONFIG.testFileSize,
    hash: faker.string.alphanumeric(64),
    storageClass,
    retentionPeriod: TEST_CONFIG.retentionPeriod,
    encryptionMetadata: {
      algorithm: 'AES-256-GCM',
      keyId: TEST_CONFIG.kmsKeyId,
      kmsArn: 'arn:aws:kms:test',
      keyRotationPeriod: 90,
      hsmEnabled: true
    },
    chainOfCustody: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
    updatedBy: 'test-user',
    version: 1,
    auditLog: []
  };
}

/**
 * Helper function to verify replication status
 */
async function verifyReplication(evidenceId: string): Promise<boolean> {
  try {
    const primaryMetadata = await storageService.getEvidenceMetadata(evidenceId);
    const backupContainer = mockAzureBlob.getContainerClient(TEST_CONFIG.backupBucket);
    const backupBlob = backupContainer.getBlobClient(`evidence/${evidenceId}`);
    const backupProperties = await backupBlob.getProperties();

    return backupProperties.metadata?.hash === primaryMetadata.hash;
  } catch (error) {
    return false;
  }
}