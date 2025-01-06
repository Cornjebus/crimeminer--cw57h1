/**
 * @file Case service implementation with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Implements secure case management business logic with comprehensive
 * audit logging, encryption, and chain of custody tracking
 */

import { Injectable } from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { SecurityValidator } from '@crimeminer/security'; // v1.0.0
import { EncryptionService } from '@crimeminer/encryption'; // v1.0.0
import { AuditLogger } from '@crimeminer/audit'; // v1.0.0
import { ICase, CaseStatus, SecurityClassification } from '../interfaces/case.interface';
import { CaseRepository } from '../repositories/case.repository';
import { ValidationErrorCodes, SecurityErrorCodes } from '../../../common/constants/error-codes';

@Injectable()
export class CaseService {
  constructor(
    private readonly caseRepository: CaseRepository,
    private readonly securityValidator: SecurityValidator,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogger: AuditLogger
  ) {}

  /**
   * Retrieves all cases with security filtering and decryption
   * @param filter Query filter criteria
   * @param userId ID of requesting user
   * @returns Promise resolving to authorized cases
   */
  async getCases(filter: FilterQuery<ICase>, userId: string): Promise<ICase[]> {
    try {
      // Validate user security clearance
      await this.securityValidator.validateAccess({
        userId,
        action: 'LIST',
        resource: 'cases'
      });

      // Apply security classification filters
      const securityFilter = await this.securityValidator.getSecurityFilter(userId);
      const combinedFilter = { ...filter, ...securityFilter };

      // Log access attempt
      await this.auditLogger.logAccess({
        action: 'LIST_CASES',
        userId,
        resource: 'cases',
        details: { filter: combinedFilter }
      });

      // Retrieve filtered cases
      const cases = await this.caseRepository.findAll(combinedFilter, userId);

      // Decrypt sensitive fields
      const decryptedCases = await Promise.all(
        cases.map(async (caseItem) => {
          if (caseItem.encryptedFields?.length) {
            const decryptedData = await this.encryptionService.decryptFields(
              caseItem.metadata,
              caseItem.encryptedFields
            );
            return { ...caseItem, metadata: decryptedData };
          }
          return caseItem;
        })
      );

      return decryptedCases;
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIST_CASES_FAILED',
        userId,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieves a specific case with security validation
   * @param id Case ID
   * @param userId ID of requesting user
   * @returns Promise resolving to authorized case
   */
  async getCaseById(id: string, userId: string): Promise<ICase> {
    try {
      // Validate case ID format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Check user security clearance
      await this.securityValidator.validateAccess({
        userId,
        action: 'READ',
        resource: 'cases',
        resourceId: id
      });

      // Log access attempt
      await this.auditLogger.logAccess({
        action: 'VIEW_CASE',
        userId,
        resource: 'cases',
        resourceId: id
      });

      // Retrieve case with security checks
      const caseData = await this.caseRepository.findById(id, userId);

      // Decrypt sensitive fields if present
      if (caseData.encryptedFields?.length) {
        const decryptedData = await this.encryptionService.decryptFields(
          caseData.metadata,
          caseData.encryptedFields
        );
        caseData.metadata = decryptedData;
      }

      // Update chain of custody
      await this.caseRepository.update(
        id,
        {
          chainOfCustody: [
            ...caseData.chainOfCustody,
            {
              action: 'VIEWED',
              timestamp: new Date(),
              userId,
              notes: 'Case accessed',
              verificationHash: ''
            }
          ]
        },
        userId
      );

      return caseData;
    } catch (error) {
      await this.auditLogger.logError({
        action: 'VIEW_CASE_FAILED',
        userId,
        resourceId: id,
        error
      });
      throw error;
    }
  }

  /**
   * Creates a new case with security controls
   * @param caseData Case data to create
   * @param userId ID of creating user
   * @returns Promise resolving to created case
   */
  async createCase(caseData: Partial<ICase>, userId: string): Promise<ICase> {
    try {
      // Validate security classification
      await this.securityValidator.validateClassificationAccess(
        userId,
        caseData.securityClassification
      );

      // Verify user creation permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'CREATE',
        resource: 'cases'
      });

      // Encrypt sensitive fields
      const { encryptedData, encryptedFields } = await this.encryptionService.encryptFields(
        caseData.metadata
      );

      // Set retention policy and initial status
      const enrichedCaseData = {
        ...caseData,
        metadata: encryptedData,
        encryptedFields,
        status: CaseStatus.ACTIVE,
        chainOfCustody: [{
          action: 'CREATED',
          timestamp: new Date(),
          userId,
          notes: 'Initial case creation',
          verificationHash: ''
        }]
      };

      // Create case with audit trail
      const createdCase = await this.caseRepository.create(enrichedCaseData, userId);

      // Log creation in audit trail
      await this.auditLogger.logCreate({
        action: 'CREATE_CASE',
        userId,
        resource: 'cases',
        resourceId: createdCase.id,
        details: {
          classification: createdCase.securityClassification,
          status: createdCase.status
        }
      });

      return createdCase;
    } catch (error) {
      await this.auditLogger.logError({
        action: 'CREATE_CASE_FAILED',
        userId,
        error
      });
      throw error;
    }
  }

  /**
   * Updates case with security validation
   * @param id Case ID to update
   * @param caseData Updated case data
   * @param userId ID of updating user
   * @returns Promise resolving to updated case
   */
  async updateCase(id: string, caseData: Partial<ICase>, userId: string): Promise<ICase> {
    try {
      // Validate update permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'UPDATE',
        resource: 'cases',
        resourceId: id
      });

      // Check security classification changes
      if (caseData.securityClassification) {
        await this.securityValidator.validateClassificationAccess(
          userId,
          caseData.securityClassification
        );
      }

      // Verify retention policy
      const existingCase = await this.caseRepository.findById(id, userId);
      if (existingCase.status === CaseStatus.ARCHIVED) {
        throw new Error(SecurityErrorCodes.ACCESS_DENIED);
      }

      // Encrypt updated metadata if present
      let encryptedData = caseData.metadata;
      let encryptedFields = existingCase.encryptedFields;
      if (caseData.metadata) {
        const encryptionResult = await this.encryptionService.encryptFields(caseData.metadata);
        encryptedData = encryptionResult.encryptedData;
        encryptedFields = encryptionResult.encryptedFields;
      }

      // Update case with audit trail
      const updatedCase = await this.caseRepository.update(
        id,
        {
          ...caseData,
          metadata: encryptedData,
          encryptedFields,
          chainOfCustody: [
            ...existingCase.chainOfCustody,
            {
              action: 'UPDATED',
              timestamp: new Date(),
              userId,
              notes: 'Case information updated',
              verificationHash: ''
            }
          ]
        },
        userId
      );

      // Log modification details
      await this.auditLogger.logUpdate({
        action: 'UPDATE_CASE',
        userId,
        resource: 'cases',
        resourceId: id,
        details: {
          classification: updatedCase.securityClassification,
          changes: caseData
        }
      });

      return updatedCase;
    } catch (error) {
      await this.auditLogger.logError({
        action: 'UPDATE_CASE_FAILED',
        userId,
        resourceId: id,
        error
      });
      throw error;
    }
  }

  /**
   * Deletes case with security checks
   * @param id Case ID to delete
   * @param userId ID of deleting user
   * @returns Promise resolving to deletion status
   */
  async deleteCase(id: string, userId: string): Promise<boolean> {
    try {
      // Validate deletion permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'DELETE',
        resource: 'cases',
        resourceId: id
      });

      // Check retention policy
      const existingCase = await this.caseRepository.findById(id, userId);
      if (existingCase.status === CaseStatus.ARCHIVED) {
        throw new Error(SecurityErrorCodes.ACCESS_DENIED);
      }

      // Verify security clearance
      if (existingCase.securityClassification === SecurityClassification.RESTRICTED) {
        throw new Error(SecurityErrorCodes.INSUFFICIENT_CLEARANCE);
      }

      // Log deletion request
      await this.auditLogger.logDelete({
        action: 'DELETE_CASE',
        userId,
        resource: 'cases',
        resourceId: id,
        details: {
          classification: existingCase.securityClassification,
          status: existingCase.status
        }
      });

      // Execute deletion
      const deleted = await this.caseRepository.delete(id, userId);

      return deleted;
    } catch (error) {
      await this.auditLogger.logError({
        action: 'DELETE_CASE_FAILED',
        userId,
        resourceId: id,
        error
      });
      throw error;
    }
  }
}