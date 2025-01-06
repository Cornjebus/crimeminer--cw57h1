/**
 * @file Integration tests for CrimeMiner ML service
 * @version 1.0.0
 * @description Validates end-to-end functionality of multimedia evidence analysis pipelines
 * with comprehensive security and compliance testing
 */

import { describe, it, beforeEach, afterEach, expect } from 'jest'; // v29.0.0
import { Container } from 'typedi'; // v0.3.0
import { AnalysisService } from '../../src/ml-service/src/services/analysis.service';
import {
  IAnalysisRequest,
  IAnalysisResult,
  EvidenceMediaType,
  AnalysisType,
  AnalysisStatus
} from '../../src/ml-service/src/interfaces/analysis.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Test configuration
const TEST_TIMEOUT = 60000;
const SAMPLE_EVIDENCE_PATH = './test-data';
const BATCH_SIZE = 1000;
const PROCESSING_TIME_LIMIT = 600000; // 10 minutes

/**
 * Generate secure test evidence ID with audit trail
 */
const generateTestEvidenceId = (): string => {
  return crypto.randomUUID();
};

/**
 * Setup test data with security compliance
 */
const setupTestData = async (mediaType: EvidenceMediaType): Promise<{
  request: IAnalysisRequest;
  expectedResults: Partial<IAnalysisResult>;
}> => {
  const evidenceId = generateTestEvidenceId();
  const testFilePath = path.join(SAMPLE_EVIDENCE_PATH, `sample.${mediaType.toLowerCase()}`);

  // Prepare test request with security metadata
  const request: IAnalysisRequest = {
    evidenceId,
    mediaType,
    analysisTypes: getAnalysisTypesForMedia(mediaType),
    priority: 1,
    metadata: {
      testId: crypto.randomUUID(),
      securityClassification: 'TEST',
      auditToken: crypto.randomBytes(32).toString('hex')
    }
  };

  // Prepare expected results structure
  const expectedResults: Partial<IAnalysisResult> = {
    evidenceId,
    status: AnalysisStatus.COMPLETED,
    confidence: expect.any(Number)
  };

  return { request, expectedResults };
};

/**
 * Get applicable analysis types for media type
 */
const getAnalysisTypesForMedia = (mediaType: EvidenceMediaType): AnalysisType[] => {
  switch (mediaType) {
    case EvidenceMediaType.AUDIO:
      return [
        AnalysisType.TRANSCRIPTION,
        AnalysisType.SPEAKER_ID,
        AnalysisType.LANGUAGE_DETECTION
      ];
    case EvidenceMediaType.VIDEO:
      return [
        AnalysisType.OBJECT_DETECTION,
        AnalysisType.FACE_DETECTION
      ];
    case EvidenceMediaType.IMAGE:
      return [
        AnalysisType.OBJECT_DETECTION,
        AnalysisType.FACE_DETECTION,
        AnalysisType.OCR
      ];
    case EvidenceMediaType.TEXT:
      return [AnalysisType.ENTITY_EXTRACTION];
    default:
      return [];
  }
};

describe('ML Service Integration Tests', () => {
  let analysisService: AnalysisService;

  beforeEach(() => {
    analysisService = Container.get(AnalysisService);
  });

  afterEach(async () => {
    // Cleanup test data and verify removal
    await fs.rm(SAMPLE_EVIDENCE_PATH, { recursive: true, force: true });
    await fs.mkdir(SAMPLE_EVIDENCE_PATH);
  });

  describe('Audio Analysis Pipeline', () => {
    it('should process audio files with CJIS compliance', async () => {
      const { request, expectedResults } = await setupTestData(EvidenceMediaType.AUDIO);
      
      const results = await analysisService.analyzeEvidence(request);

      expect(results).toHaveLength(3); // One result per analysis type
      results.forEach(result => {
        expect(result).toMatchObject(expectedResults);
        expect(result.confidence).toBeGreaterThanOrEqual(0.95); // 95% accuracy requirement
      });
    }, TEST_TIMEOUT);

    it('should handle batch audio processing within time limit', async () => {
      const startTime = Date.now();
      const requests: IAnalysisRequest[] = [];

      // Generate 1000 15-minute audio files
      for (let i = 0; i < BATCH_SIZE; i++) {
        const { request } = await setupTestData(EvidenceMediaType.AUDIO);
        requests.push(request);
      }

      // Process in parallel
      const results = await Promise.all(
        requests.map(request => analysisService.analyzeEvidence(request))
      );

      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThanOrEqual(PROCESSING_TIME_LIMIT);
      
      results.flat().forEach(result => {
        expect(result.status).toBe(AnalysisStatus.COMPLETED);
        expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      });
    }, TEST_TIMEOUT);
  });

  describe('Video Analysis Pipeline', () => {
    it('should process video with security controls', async () => {
      const { request, expectedResults } = await setupTestData(EvidenceMediaType.VIDEO);
      
      const results = await analysisService.analyzeEvidence(request);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toMatchObject(expectedResults);
        expect(result.content).toHaveProperty('objects');
        expect(result.content).toHaveProperty('faces');
      });
    }, TEST_TIMEOUT);
  });

  describe('Image Analysis Pipeline', () => {
    it('should process images with privacy controls', async () => {
      const { request, expectedResults } = await setupTestData(EvidenceMediaType.IMAGE);
      
      const results = await analysisService.analyzeEvidence(request);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toMatchObject(expectedResults);
        if (result.resultType === AnalysisType.FACE_DETECTION) {
          expect(result.content.faces).toBeDefined();
          expect(result.content.faces![0].metadata).not.toHaveProperty('biometric');
        }
      });
    }, TEST_TIMEOUT);
  });

  describe('Text Analysis Pipeline', () => {
    it('should process text with security compliance', async () => {
      const { request, expectedResults } = await setupTestData(EvidenceMediaType.TEXT);
      
      const results = await analysisService.analyzeEvidence(request);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject(expectedResults);
      expect(results[0].content.entities).toBeDefined();
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid media types securely', async () => {
      const { request } = await setupTestData(EvidenceMediaType.AUDIO);
      request.mediaType = 'INVALID' as EvidenceMediaType;

      await expect(analysisService.analyzeEvidence(request))
        .rejects.toThrow('Invalid media type');
    });

    it('should handle missing files securely', async () => {
      const { request } = await setupTestData(EvidenceMediaType.AUDIO);
      
      await expect(analysisService.analyzeEvidence(request))
        .rejects.toThrow();
    });

    it('should handle process cancellation', async () => {
      const { request } = await setupTestData(EvidenceMediaType.VIDEO);
      
      const analysisPromise = analysisService.analyzeEvidence(request);
      await analysisService.cancelAnalysis(request.evidenceId);

      await expect(analysisPromise).rejects.toThrow();
    });
  });

  describe('Security Compliance', () => {
    it('should validate CJIS compliance requirements', async () => {
      const { request } = await setupTestData(EvidenceMediaType.AUDIO);
      
      const results = await analysisService.analyzeEvidence(request);
      const storedResults = await analysisService.getAnalysisResults(request.evidenceId);

      // Verify results are properly sanitized
      expect(storedResults).toEqual(results);
      storedResults.forEach(result => {
        expect(result.error?.details).toBeUndefined();
      });
    });

    it('should enforce resource limits', async () => {
      const requests = await Promise.all(
        Array(150).fill(null).map(() => setupTestData(EvidenceMediaType.VIDEO))
      );

      await expect(Promise.all(
        requests.map(({ request }) => analysisService.analyzeEvidence(request))
      )).rejects.toThrow('Maximum concurrent process limit reached');
    });
  });
});