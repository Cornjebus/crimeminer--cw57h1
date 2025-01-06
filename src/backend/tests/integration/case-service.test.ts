/**
 * @file Integration tests for case management service with FedRAMP and CJIS compliance validation
 * @version 1.0.0
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SecurityValidator } from '@security/validator'; // v1.0.0
import { AuditLogger } from '@audit/logger'; // v1.0.0
import { CaseService } from '../../src/case-service/src/services/case.service';
import { CaseStatus, SecurityClassification, ICase } from '../../src/case-service/src/interfaces/case.interface';
import { ValidationErrorCodes, SecurityErrorCodes } from '../../src/common/constants/error-codes';

describe('CaseService Integration Tests', () => {
  let moduleRef: TestingModule;
  let caseService: CaseService;
  let securityValidator: SecurityValidator;
  let auditLogger: AuditLogger;
  let mongod: MongoMemoryServer;

  const testUserId = 'test-user-id';
  const testCaseData: Partial<ICase> = {
    title: 'Test Investigation Case',
    description: 'Confidential test case for integration testing',
    securityClassification: SecurityClassification.CONFIDENTIAL,
    metadata: {
      suspects: ['John Doe'],
      locations: ['123 Test St'],
      evidenceCount: 5,
      sensitiveInfo: {
        ssn: '123-45-6789',
        dob: '1980-01-01'
      }
    },
    assignedUsers: [testUserId],
    retentionPeriod: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  };

  beforeAll(async () => {
    // Initialize MongoDB memory server with security settings
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: 'test-cases-db',
        auth: true
      }
    });

    // Create test module with security configurations
    moduleRef = await Test.createTestingModule({
      providers: [
        CaseService,
        {
          provide: SecurityValidator,
          useValue: {
            validateAccess: jest.fn().mockResolvedValue(true),
            validateClassificationAccess: jest.fn().mockResolvedValue(true),
            getSecurityFilter: jest.fn().mockResolvedValue({})
          }
        },
        {
          provide: AuditLogger,
          useValue: {
            logAccess: jest.fn().mockResolvedValue(undefined),
            logCreate: jest.fn().mockResolvedValue(undefined),
            logUpdate: jest.fn().mockResolvedValue(undefined),
            logDelete: jest.fn().mockResolvedValue(undefined),
            logError: jest.fn().mockResolvedValue(undefined)
          }
        }
      ]
    }).compile();

    caseService = moduleRef.get<CaseService>(CaseService);
    securityValidator = moduleRef.get<SecurityValidator>(SecurityValidator);
    auditLogger = moduleRef.get<AuditLogger>(AuditLogger);
  });

  afterAll(async () => {
    // Cleanup with security verification
    await moduleRef.close();
    await mongod.stop();
  });

  describe('Secure Case Creation', () => {
    it('should create case with proper security controls', async () => {
      // Verify security clearance
      const validateClassificationSpy = jest.spyOn(securityValidator, 'validateClassificationAccess');
      const validateAccessSpy = jest.spyOn(securityValidator, 'validateAccess');
      const auditLogSpy = jest.spyOn(auditLogger, 'logCreate');

      const createdCase = await caseService.createCase(testCaseData, testUserId);

      // Verify security validations
      expect(validateClassificationSpy).toHaveBeenCalledWith(
        testUserId,
        SecurityClassification.CONFIDENTIAL
      );
      expect(validateAccessSpy).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'CREATE',
        resource: 'cases'
      });

      // Verify case creation
      expect(createdCase).toBeDefined();
      expect(createdCase.title).toBe(testCaseData.title);
      expect(createdCase.securityClassification).toBe(SecurityClassification.CONFIDENTIAL);
      
      // Verify encryption
      expect(createdCase.encryptedFields).toContain('ssn');
      expect(createdCase.encryptedFields).toContain('dob');
      expect(createdCase.metadata.ssn).not.toBe(testCaseData.metadata.ssn);

      // Verify audit logging
      expect(auditLogSpy).toHaveBeenCalledWith({
        action: 'CREATE_CASE',
        userId: testUserId,
        resource: 'cases',
        resourceId: createdCase.id,
        details: {
          classification: SecurityClassification.CONFIDENTIAL,
          status: CaseStatus.ACTIVE
        }
      });
    });

    it('should reject creation with insufficient clearance', async () => {
      jest.spyOn(securityValidator, 'validateClassificationAccess')
        .mockRejectedValueOnce(new Error(SecurityErrorCodes.INSUFFICIENT_CLEARANCE));

      await expect(caseService.createCase(testCaseData, testUserId))
        .rejects.toThrow(SecurityErrorCodes.INSUFFICIENT_CLEARANCE);
    });
  });

  describe('Secure Case Retrieval', () => {
    let testCaseId: string;

    beforeEach(async () => {
      const createdCase = await caseService.createCase(testCaseData, testUserId);
      testCaseId = createdCase.id;
    });

    it('should retrieve case with proper security checks', async () => {
      const validateAccessSpy = jest.spyOn(securityValidator, 'validateAccess');
      const auditLogSpy = jest.spyOn(auditLogger, 'logAccess');

      const retrievedCase = await caseService.getCaseById(testCaseId, testUserId);

      // Verify security checks
      expect(validateAccessSpy).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'READ',
        resource: 'cases',
        resourceId: testCaseId
      });

      // Verify case data
      expect(retrievedCase).toBeDefined();
      expect(retrievedCase.id).toBe(testCaseId);
      
      // Verify audit logging
      expect(auditLogSpy).toHaveBeenCalledWith({
        action: 'VIEW_CASE',
        userId: testUserId,
        resource: 'cases',
        resourceId: testCaseId
      });
    });

    it('should enforce field-level encryption', async () => {
      const retrievedCase = await caseService.getCaseById(testCaseId, testUserId);
      
      // Verify sensitive data encryption
      expect(retrievedCase.metadata.ssn).not.toBe(testCaseData.metadata.ssn);
      expect(retrievedCase.encryptedFields).toContain('ssn');
      expect(retrievedCase.encryptedFields).toContain('dob');
    });
  });

  describe('Secure Case Updates', () => {
    let testCaseId: string;

    beforeEach(async () => {
      const createdCase = await caseService.createCase(testCaseData, testUserId);
      testCaseId = createdCase.id;
    });

    it('should update case with security validation', async () => {
      const updateData = {
        title: 'Updated Test Case',
        securityClassification: SecurityClassification.RESTRICTED
      };

      const validateAccessSpy = jest.spyOn(securityValidator, 'validateAccess');
      const validateClassificationSpy = jest.spyOn(securityValidator, 'validateClassificationAccess');
      const auditLogSpy = jest.spyOn(auditLogger, 'logUpdate');

      const updatedCase = await caseService.updateCase(testCaseId, updateData, testUserId);

      // Verify security validations
      expect(validateAccessSpy).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'UPDATE',
        resource: 'cases',
        resourceId: testCaseId
      });
      expect(validateClassificationSpy).toHaveBeenCalledWith(
        testUserId,
        SecurityClassification.RESTRICTED
      );

      // Verify update
      expect(updatedCase.title).toBe(updateData.title);
      expect(updatedCase.securityClassification).toBe(SecurityClassification.RESTRICTED);

      // Verify audit logging
      expect(auditLogSpy).toHaveBeenCalledWith({
        action: 'UPDATE_CASE',
        userId: testUserId,
        resource: 'cases',
        resourceId: testCaseId,
        details: {
          classification: SecurityClassification.RESTRICTED,
          changes: updateData
        }
      });
    });
  });

  describe('Secure Case Deletion', () => {
    let testCaseId: string;

    beforeEach(async () => {
      const createdCase = await caseService.createCase(testCaseData, testUserId);
      testCaseId = createdCase.id;
    });

    it('should delete case with security validation', async () => {
      const validateAccessSpy = jest.spyOn(securityValidator, 'validateAccess');
      const auditLogSpy = jest.spyOn(auditLogger, 'logDelete');

      const result = await caseService.deleteCase(testCaseId, testUserId);

      // Verify security checks
      expect(validateAccessSpy).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'DELETE',
        resource: 'cases',
        resourceId: testCaseId
      });

      // Verify deletion
      expect(result).toBe(true);

      // Verify audit logging
      expect(auditLogSpy).toHaveBeenCalledWith({
        action: 'DELETE_CASE',
        userId: testUserId,
        resource: 'cases',
        resourceId: testCaseId,
        details: expect.any(Object)
      });
    });

    it('should prevent deletion of restricted cases', async () => {
      // Update case to restricted classification
      await caseService.updateCase(testCaseId, {
        securityClassification: SecurityClassification.RESTRICTED
      }, testUserId);

      await expect(caseService.deleteCase(testCaseId, testUserId))
        .rejects.toThrow(SecurityErrorCodes.INSUFFICIENT_CLEARANCE);
    });
  });
});