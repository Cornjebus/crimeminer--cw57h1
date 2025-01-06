/**
 * @file Integration tests for Evidence Service
 * @version 1.0.0
 * @description Validates end-to-end functionality of evidence processing, chain of custody,
 * and CJIS compliance requirements
 */

import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'jest'; // v29.6.2
import { expect } from '@jest/globals'; // v29.6.2
import { MongoMemoryServer } from 'mongodb-memory-server'; // v8.15.1
import { TestDataGenerator } from '@test/utils'; // v1.0.0
import { EvidenceService } from '../../src/evidence-service/src/services/evidence.service';
import { 
  IEvidence, 
  EvidenceMediaType, 
  EvidenceStatus 
} from '../../src/evidence-service/src/interfaces/evidence.interface';

describe('Evidence Service Integration Tests', () => {
  let evidenceService: EvidenceService;
  let mongoServer: MongoMemoryServer;
  let testDataGenerator: TestDataGenerator;

  // Test case ID for tracking
  const TEST_CASE_ID = 'TEST-CASE-001';

  beforeAll(async () => {
    // Start MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Configure test environment
    process.env.MONGODB_URI = mongoUri;
    process.env.KMS_KEY_ID = 'test-key-id';
    process.env.CURRENT_USER_ID = 'test-user';
    process.env.SESSION_ID = 'test-session';
    process.env.REQUEST_IP = '127.0.0.1';

    // Initialize test data generator
    testDataGenerator = new TestDataGenerator();
  });

  afterAll(async () => {
    // Cleanup test environment
    await mongoServer.stop();
    await testDataGenerator.cleanup();
  });

  beforeEach(() => {
    // Initialize evidence service for each test
    evidenceService = new EvidenceService();
  });

  describe('Multi-format Evidence Processing', () => {
    it('should process audio evidence with transcription', async () => {
      // Generate test audio file
      const audioFile = await testDataGenerator.generateAudioFile(15); // 15 minutes

      // Upload and process audio evidence
      const evidence = await evidenceService.uploadEvidence(
        audioFile.buffer,
        'test-audio.mp3',
        TEST_CASE_ID,
        EvidenceMediaType.AUDIO
      );

      // Verify processing completed successfully
      expect(evidence.status).toBe(EvidenceStatus.COMPLETED);
      expect(evidence.mediaType).toBe(EvidenceMediaType.AUDIO);
      expect(evidence.metadata.mimeType).toBe('audio/mpeg');
      
      // Verify WORM compliance
      expect(evidence.wormCompliance.lockStatus).toBe(true);
      expect(evidence.wormCompliance.retentionPeriod).toBeGreaterThanOrEqual(365);

      // Verify chain of custody
      expect(evidence.chainOfCustody).toHaveLength(2); // Upload + Processing
      expect(evidence.chainOfCustody[0].complianceMetadata.standard).toBe('CJIS');
    });

    it('should process video evidence with frame extraction', async () => {
      const videoFile = await testDataGenerator.generateVideoFile(5); // 5 minutes

      const evidence = await evidenceService.uploadEvidence(
        videoFile.buffer,
        'test-video.mp4',
        TEST_CASE_ID,
        EvidenceMediaType.VIDEO
      );

      expect(evidence.status).toBe(EvidenceStatus.COMPLETED);
      expect(evidence.mediaType).toBe(EvidenceMediaType.VIDEO);
      expect(evidence.metadata.mimeType).toBe('video/mp4');
      expect(evidence.metadata.duration).toBe(300); // 5 minutes in seconds
    });

    it('should process image evidence with object detection', async () => {
      const imageFile = await testDataGenerator.generateImageFile();

      const evidence = await evidenceService.uploadEvidence(
        imageFile.buffer,
        'test-image.jpg',
        TEST_CASE_ID,
        EvidenceMediaType.IMAGE
      );

      expect(evidence.status).toBe(EvidenceStatus.COMPLETED);
      expect(evidence.mediaType).toBe(EvidenceMediaType.IMAGE);
      expect(evidence.metadata.mimeType).toBe('image/jpeg');
      expect(evidence.metadata.dimensions).toBeDefined();
    });
  });

  describe('Bulk Processing Performance', () => {
    it('should process 1000 audio files within 10 minutes', async () => {
      // Generate 1000 test audio files
      const audioFiles = await Promise.all(
        Array(1000).fill(null).map(() => testDataGenerator.generateAudioFile(15))
      );

      // Record start time
      const startTime = Date.now();

      // Process files in parallel
      const results = await Promise.all(
        audioFiles.map(file => 
          evidenceService.uploadEvidence(
            file.buffer,
            `test-audio-${file.id}.mp3`,
            TEST_CASE_ID,
            EvidenceMediaType.AUDIO
          )
        )
      );

      // Calculate processing time
      const processingTime = (Date.now() - startTime) / 1000 / 60; // minutes

      // Verify processing time
      expect(processingTime).toBeLessThanOrEqual(10);

      // Verify all files processed successfully
      expect(results).toHaveLength(1000);
      expect(results.every(r => r.status === EvidenceStatus.COMPLETED)).toBe(true);
    });
  });

  describe('Chain of Custody Tracking', () => {
    it('should maintain cryptographically secure custody chain', async () => {
      const evidence = await evidenceService.uploadEvidence(
        await testDataGenerator.generateTextFile(),
        'test-document.txt',
        TEST_CASE_ID,
        EvidenceMediaType.TEXT
      );

      // Verify initial custody chain
      expect(evidence.chainOfCustody[0].digitalSignature).toBeDefined();
      expect(evidence.chainOfCustody[0].complianceMetadata.controls).toContain('5.4.1.1');

      // Update evidence status
      const updatedEvidence = await evidenceService.updateEvidenceStatus(
        evidence.id,
        EvidenceStatus.COMPLETED
      );

      // Verify custody chain update
      expect(updatedEvidence.chainOfCustody).toHaveLength(2);
      expect(updatedEvidence.chainOfCustody[1].action).toBe('STATUS_UPDATE');
      expect(updatedEvidence.chainOfCustody[1].digitalSignature).toBeDefined();

      // Verify integrity
      const integrityResult = await evidenceService.verifyEvidenceIntegrity(evidence.id);
      expect(integrityResult.status).toBe('VALID');
    });
  });

  describe('CJIS Compliance', () => {
    it('should enforce CJIS security requirements', async () => {
      const evidence = await evidenceService.uploadEvidence(
        await testDataGenerator.generateTextFile(),
        'classified-doc.txt',
        TEST_CASE_ID,
        EvidenceMediaType.TEXT
      );

      // Verify encryption
      expect(evidence.metadata.encryptionMetadata.algorithm).toBe('AES-256-GCM');
      expect(evidence.metadata.encryptionMetadata.keyId).toBeDefined();

      // Verify audit logging
      const custodyRecord = evidence.chainOfCustody[0];
      expect(custodyRecord.userId).toBeDefined();
      expect(custodyRecord.timestamp).toBeDefined();
      expect(custodyRecord.complianceMetadata.standard).toBe('CJIS');

      // Verify WORM compliance
      expect(evidence.wormCompliance.enabled).toBe(true);
      expect(evidence.wormCompliance.retentionPeriod).toBeGreaterThanOrEqual(365);

      // Verify integrity checks
      const integrityResult = await evidenceService.verifyEvidenceIntegrity(evidence.id);
      expect(integrityResult.storageIntegrity).toBe(true);
      expect(integrityResult.recordIntegrity).toBe(true);
    });
  });
});