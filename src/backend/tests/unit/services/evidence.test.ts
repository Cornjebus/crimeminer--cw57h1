/**
 * @file Unit tests for EvidenceService implementation
 * @version 1.0.0
 * @description Comprehensive test suite validating evidence handling, security compliance,
 * chain of custody, and performance requirements for CrimeMiner platform
 */

import { mock, instance, when, verify, anything, deepEqual } from 'ts-mockito'; // v2.6.1
import { performance } from 'perf_hooks';
import { StorageService } from '@aws-sdk/client-s3'; // v3.0.0
import { EvidenceService } from '../../../src/evidence-service/src/services/evidence.service';
import { 
  IEvidence, 
  EvidenceMediaType, 
  EvidenceStatus 
} from '../../../src/evidence-service/src/interfaces/evidence.interface';
import { Logger } from '../../../src/common/utils/logger.util';
import { ValidationErrorCodes } from '../../../src/common/constants/error-codes';

describe('EvidenceService', () => {
  // Test setup variables
  let evidenceService: EvidenceService;
  let mockStorageService: StorageService;
  let mockLogger: Logger;
  let mockEvidenceModel: any;

  // Test data
  const testCaseId = 'test-case-123';
  const testEvidenceId = 'test-evidence-123';
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Initialize mocks
    mockStorageService = mock(StorageService);
    mockLogger = mock(Logger);
    mockEvidenceModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCaseId: jest.fn()
    };

    // Create service instance with mocks
    evidenceService = new EvidenceService(
      mockEvidenceModel,
      instance(mockStorageService),
      instance(mockLogger)
    );

    // Set environment variables for testing
    process.env.CURRENT_USER_ID = testUserId;
    process.env.SESSION_ID = 'test-session-123';
    process.env.REQUEST_IP = '127.0.0.1';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadEvidence', () => {
    it('should successfully upload evidence with WORM compliance', async () => {
      // Arrange
      const testFile = Buffer.from('test file content');
      const fileName = 'test.mp4';
      
      when(mockStorageService.uploadEvidence(anything(), anything())).thenResolve({
        key: `${testCaseId}/${testEvidenceId}/${fileName}`,
        metadata: {
          hash: 'test-hash-123',
          keyVersion: 'v1',
          iv: 'test-iv'
        }
      });

      mockEvidenceModel.create.mockResolvedValue({
        id: testEvidenceId,
        caseId: testCaseId,
        status: EvidenceStatus.UPLOADED
      });

      // Act
      const result = await evidenceService.uploadEvidence(
        testFile,
        fileName,
        testCaseId,
        EvidenceMediaType.VIDEO
      );

      // Assert
      expect(result.id).toBe(testEvidenceId);
      expect(result.status).toBe(EvidenceStatus.UPLOADED);
      verify(mockStorageService.uploadEvidence(anything(), deepEqual({
        id: anything(),
        key: anything(),
        size: testFile.length,
        storageClass: 'HOT',
        retentionPeriod: 365
      }))).once();
    });

    it('should enforce FedRAMP compliance for evidence upload', async () => {
      // Arrange
      const testFile = Buffer.from('test file content');
      const fileName = 'test.pdf';

      // Act
      await evidenceService.uploadEvidence(
        testFile,
        fileName,
        testCaseId,
        EvidenceMediaType.TEXT
      );

      // Assert
      expect(mockEvidenceModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          wormCompliance: {
            retentionPeriod: 365,
            lockStatus: false,
            policyId: 'DEFAULT_RETENTION_POLICY'
          },
          chainOfCustody: expect.arrayContaining([
            expect.objectContaining({
              action: 'UPLOAD_INITIATED',
              complianceMetadata: {
                standard: 'CJIS',
                controls: ['5.4.1.1']
              }
            })
          ])
        })
      );
    });
  });

  describe('bulkUploadPerformance', () => {
    it('should process 1000 audio files within 10 minutes', async () => {
      // Arrange
      const testFiles = Array(1000).fill(null).map(() => ({
        data: Buffer.from('test audio content'),
        name: 'test.mp3',
        mediaType: EvidenceMediaType.AUDIO
      }));

      // Act
      const startTime = performance.now();
      
      for (const file of testFiles) {
        await evidenceService.uploadEvidence(
          file.data,
          file.name,
          testCaseId,
          file.mediaType
        );
      }

      const endTime = performance.now();
      const processingTime = (endTime - startTime) / 1000 / 60; // Convert to minutes

      // Assert
      expect(processingTime).toBeLessThanOrEqual(10);
    });
  });

  describe('getEvidence', () => {
    it('should verify integrity before returning evidence', async () => {
      // Arrange
      const mockEvidence = {
        id: testEvidenceId,
        verifyIntegrity: jest.fn().mockResolvedValue(true)
      };
      mockEvidenceModel.findById.mockResolvedValue(mockEvidence);

      // Act
      const result = await evidenceService.getEvidence(testEvidenceId);

      // Assert
      expect(mockEvidence.verifyIntegrity).toHaveBeenCalled();
      expect(result).toBe(mockEvidence);
    });

    it('should throw error if integrity verification fails', async () => {
      // Arrange
      const mockEvidence = {
        id: testEvidenceId,
        verifyIntegrity: jest.fn().mockResolvedValue(false)
      };
      mockEvidenceModel.findById.mockResolvedValue(mockEvidence);

      // Act & Assert
      await expect(evidenceService.getEvidence(testEvidenceId))
        .rejects
        .toThrow('Evidence integrity verification failed');
    });
  });

  describe('verifyChainOfCustody', () => {
    it('should validate complete chain of custody', async () => {
      // Arrange
      const mockEvidence = {
        id: testEvidenceId,
        chainOfCustody: [
          {
            action: 'UPLOAD_INITIATED',
            timestamp: new Date(),
            userId: testUserId,
            digitalSignature: 'valid-signature-1'
          },
          {
            action: 'PROCESSING_COMPLETE',
            timestamp: new Date(),
            userId: testUserId,
            digitalSignature: 'valid-signature-2'
          }
        ]
      };
      mockEvidenceModel.findById.mockResolvedValue(mockEvidence);

      // Act
      const result = await evidenceService.verifyEvidenceIntegrity(testEvidenceId);

      // Assert
      expect(result.status).toBe('VALID');
      verify(mockStorageService.verifyStorageIntegrity(testEvidenceId)).once();
    });
  });

  describe('updateEvidenceStatus', () => {
    it('should maintain chain of custody during status updates', async () => {
      // Arrange
      const mockEvidence = {
        id: testEvidenceId,
        status: EvidenceStatus.UPLOADED,
        updateStatus: jest.fn().mockImplementation(function(status) {
          this.status = status;
          return this;
        })
      };
      mockEvidenceModel.findById.mockResolvedValue(mockEvidence);

      // Act
      const result = await evidenceService.updateEvidenceStatus(
        testEvidenceId,
        EvidenceStatus.COMPLETED
      );

      // Assert
      expect(result.status).toBe(EvidenceStatus.COMPLETED);
      expect(mockEvidence.updateStatus).toHaveBeenCalledWith(EvidenceStatus.COMPLETED);
    });
  });

  describe('getEvidenceByCaseId', () => {
    it('should return all evidence for a case with integrity verification', async () => {
      // Arrange
      const mockEvidenceList = [
        { id: 'evidence-1', verifyIntegrity: jest.fn().mockResolvedValue(true) },
        { id: 'evidence-2', verifyIntegrity: jest.fn().mockResolvedValue(true) }
      ];
      mockEvidenceModel.findByCaseId.mockResolvedValue(mockEvidenceList);

      // Act
      const result = await evidenceService.getEvidenceByCaseId(testCaseId);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockEvidenceList[0].verifyIntegrity).toHaveBeenCalled();
      expect(mockEvidenceList[1].verifyIntegrity).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle upload failures with proper logging', async () => {
      // Arrange
      const testError = new Error('Upload failed');
      when(mockStorageService.uploadEvidence(anything(), anything()))
        .thenReject(testError);

      // Act & Assert
      await expect(evidenceService.uploadEvidence(
        Buffer.from('test'),
        'test.jpg',
        testCaseId,
        EvidenceMediaType.IMAGE
      )).rejects.toThrow('Upload failed');

      verify(mockLogger.error('Evidence upload failed', testError, anything())).once();
    });

    it('should validate evidence format', async () => {
      // Act & Assert
      await expect(evidenceService.uploadEvidence(
        Buffer.from('test'),
        'test.invalid',
        testCaseId,
        'INVALID_TYPE' as EvidenceMediaType
      )).rejects.toThrow(ValidationErrorCodes.INVALID_EVIDENCE_FORMAT);
    });
  });
});