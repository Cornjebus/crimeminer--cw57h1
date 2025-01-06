/**
 * @file Unit tests for CaseService with FedRAMP High and CJIS compliance validation
 * @version 1.0.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CaseService } from '../../src/case-service/src/services/case.service';
import { CaseRepository } from '../../src/case-service/src/repositories/case.repository';
import { ICase, CaseStatus, SecurityClassification } from '../../src/case-service/src/interfaces/case.interface';
import { SecurityErrorCodes, ValidationErrorCodes } from '../../src/common/constants/error-codes';

// Mock implementations
const mockCaseRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

const mockSecurityValidator = {
  validateAccess: jest.fn(),
  validateClassificationAccess: jest.fn(),
  getSecurityFilter: jest.fn()
};

const mockEncryptionService = {
  encryptFields: jest.fn(),
  decryptFields: jest.fn()
};

const mockAuditLogger = {
  logAccess: jest.fn(),
  logCreate: jest.fn(),
  logUpdate: jest.fn(),
  logDelete: jest.fn(),
  logError: jest.fn()
};

// Test fixtures
const testUserId = 'test-user-123';
const testCaseId = '507f1f77bcf86cd799439011';

const testCase: ICase = {
  id: testCaseId,
  title: 'Test Investigation',
  description: 'Test case description',
  status: CaseStatus.ACTIVE,
  securityClassification: SecurityClassification.CONFIDENTIAL,
  metadata: {
    location: 'Test Location',
    suspects: ['John Doe']
  },
  assignedUsers: [testUserId],
  retentionPeriod: new Date('2025-01-01'),
  chainOfCustody: [],
  encryptedFields: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUserId,
  updatedBy: testUserId,
  version: 1,
  auditLog: [],
  accessControl: {
    readUsers: [testUserId],
    writeUsers: [testUserId],
    adminUsers: [testUserId],
    departmentAccess: ['test-dept'],
    securityGroups: ['test-group']
  },
  cjisCompliance: {
    isCompliant: true,
    lastValidated: new Date(),
    validatedBy: testUserId,
    complianceNotes: ['Test compliance']
  }
};

describe('CaseService', () => {
  let caseService: CaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    caseService = new CaseService(
      mockCaseRepository as any,
      mockSecurityValidator as any,
      mockEncryptionService as any,
      mockAuditLogger as any
    );
  });

  describe('getCases', () => {
    it('should return filtered cases with security checks', async () => {
      // Arrange
      const filter = { status: CaseStatus.ACTIVE };
      const securityFilter = { securityClassification: { $lte: SecurityClassification.CONFIDENTIAL } };
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockSecurityValidator.getSecurityFilter.mockResolvedValue(securityFilter);
      mockCaseRepository.findAll.mockResolvedValue([testCase]);
      mockEncryptionService.decryptFields.mockResolvedValue(testCase.metadata);

      // Act
      const result = await caseService.getCases(filter, testUserId);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockSecurityValidator.validateAccess).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'LIST',
        resource: 'cases'
      });
      expect(mockAuditLogger.logAccess).toHaveBeenCalled();
    });

    it('should handle security validation failure', async () => {
      // Arrange
      mockSecurityValidator.validateAccess.mockRejectedValue(
        new Error(SecurityErrorCodes.ACCESS_DENIED)
      );

      // Act & Assert
      await expect(caseService.getCases({}, testUserId)).rejects.toThrow(
        SecurityErrorCodes.ACCESS_DENIED
      );
      expect(mockAuditLogger.logError).toHaveBeenCalled();
    });
  });

  describe('getCaseById', () => {
    it('should return case with decrypted fields', async () => {
      // Arrange
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockCaseRepository.findById.mockResolvedValue(testCase);
      mockEncryptionService.decryptFields.mockResolvedValue(testCase.metadata);

      // Act
      const result = await caseService.getCaseById(testCaseId, testUserId);

      // Assert
      expect(result).toEqual(testCase);
      expect(mockSecurityValidator.validateAccess).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'READ',
        resource: 'cases',
        resourceId: testCaseId
      });
      expect(mockAuditLogger.logAccess).toHaveBeenCalled();
    });

    it('should validate case ID format', async () => {
      // Act & Assert
      await expect(caseService.getCaseById('invalid-id', testUserId)).rejects.toThrow(
        ValidationErrorCodes.INVALID_INPUT
      );
    });
  });

  describe('createCase', () => {
    it('should create case with security controls', async () => {
      // Arrange
      const newCase = { ...testCase };
      delete newCase.id;
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockSecurityValidator.validateClassificationAccess.mockResolvedValue(true);
      mockEncryptionService.encryptFields.mockResolvedValue({
        encryptedData: newCase.metadata,
        encryptedFields: []
      });
      mockCaseRepository.create.mockResolvedValue(testCase);

      // Act
      const result = await caseService.createCase(newCase, testUserId);

      // Assert
      expect(result).toEqual(testCase);
      expect(mockSecurityValidator.validateClassificationAccess).toHaveBeenCalledWith(
        testUserId,
        newCase.securityClassification
      );
      expect(mockAuditLogger.logCreate).toHaveBeenCalled();
    });

    it('should enforce security classification validation', async () => {
      // Arrange
      mockSecurityValidator.validateClassificationAccess.mockRejectedValue(
        new Error(SecurityErrorCodes.INSUFFICIENT_CLEARANCE)
      );

      // Act & Assert
      await expect(caseService.createCase(testCase, testUserId)).rejects.toThrow(
        SecurityErrorCodes.INSUFFICIENT_CLEARANCE
      );
    });
  });

  describe('updateCase', () => {
    it('should update case with security validation', async () => {
      // Arrange
      const updates = {
        title: 'Updated Title',
        metadata: { newField: 'test' }
      };
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockCaseRepository.findById.mockResolvedValue(testCase);
      mockEncryptionService.encryptFields.mockResolvedValue({
        encryptedData: updates.metadata,
        encryptedFields: []
      });
      mockCaseRepository.update.mockResolvedValue({ ...testCase, ...updates });

      // Act
      const result = await caseService.updateCase(testCaseId, updates, testUserId);

      // Assert
      expect(result.title).toBe(updates.title);
      expect(mockAuditLogger.logUpdate).toHaveBeenCalled();
    });

    it('should prevent updates to archived cases', async () => {
      // Arrange
      const archivedCase = { ...testCase, status: CaseStatus.ARCHIVED };
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockCaseRepository.findById.mockResolvedValue(archivedCase);

      // Act & Assert
      await expect(
        caseService.updateCase(testCaseId, { title: 'New Title' }, testUserId)
      ).rejects.toThrow(SecurityErrorCodes.ACCESS_DENIED);
    });
  });

  describe('deleteCase', () => {
    it('should delete case with security checks', async () => {
      // Arrange
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockCaseRepository.findById.mockResolvedValue(testCase);
      mockCaseRepository.delete.mockResolvedValue(true);

      // Act
      const result = await caseService.deleteCase(testCaseId, testUserId);

      // Assert
      expect(result).toBe(true);
      expect(mockAuditLogger.logDelete).toHaveBeenCalled();
    });

    it('should prevent deletion of restricted cases', async () => {
      // Arrange
      const restrictedCase = {
        ...testCase,
        securityClassification: SecurityClassification.RESTRICTED
      };
      mockSecurityValidator.validateAccess.mockResolvedValue(true);
      mockCaseRepository.findById.mockResolvedValue(restrictedCase);

      // Act & Assert
      await expect(caseService.deleteCase(testCaseId, testUserId)).rejects.toThrow(
        SecurityErrorCodes.INSUFFICIENT_CLEARANCE
      );
    });
  });
});