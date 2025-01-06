/**
 * @file Case repository implementation with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Implements secure case data access patterns with comprehensive
 * audit logging, encryption, and security controls
 */

import { Injectable } from '@nestjs/common';
import { FilterQuery, ClientSession, Model } from 'mongoose';
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { SecurityValidator } from '@crimeminer/security'; // v1.0.0
import { ICase } from '../interfaces/case.interface';
import { CaseModel } from '../models/case.model';
import { SecurityErrorCodes, ValidationErrorCodes, AuthErrorCodes } from '../../../common/constants/error-codes';

@Injectable()
export class CaseRepository {
  constructor(
    private readonly caseModel: Model<ICase>,
    private readonly auditLogger: AuditLogger,
    private readonly securityValidator: SecurityValidator
  ) {}

  /**
   * Retrieves all cases matching filter criteria with security validation
   * @param filter - Query filter criteria
   * @param userId - ID of requesting user
   * @returns Promise resolving to authorized cases
   */
  async findAll(filter: FilterQuery<ICase>, userId: string): Promise<ICase[]> {
    try {
      // Validate user access permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'READ',
        resource: 'cases'
      });

      // Apply security classification filters
      const securityFilter = await this.securityValidator.getSecurityFilter(userId);
      const combinedFilter = { ...filter, ...securityFilter };

      // Execute find with audit logging
      const cases = await this.caseModel.find(combinedFilter).exec();

      // Log access attempt
      await this.auditLogger.logAccess({
        action: 'LIST_CASES',
        userId,
        resource: 'cases',
        details: { filter: combinedFilter }
      });

      return cases;
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
   * Retrieves a case by ID with security validation
   * @param id - Case ID
   * @param userId - ID of requesting user
   * @returns Promise resolving to authorized case
   */
  async findById(id: string, userId: string): Promise<ICase> {
    try {
      // Validate case ID format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Check user access permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'READ',
        resource: 'cases',
        resourceId: id
      });

      // Query case with security check
      const caseDoc = await this.caseModel.findById(id).exec();
      if (!caseDoc) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Verify security classification access
      await this.securityValidator.validateClassificationAccess(
        userId,
        caseDoc.securityClassification
      );

      // Log access
      await this.auditLogger.logAccess({
        action: 'VIEW_CASE',
        userId,
        resource: 'cases',
        resourceId: id
      });

      return caseDoc;
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
   * @param caseData - Case data to create
   * @param userId - ID of creating user
   * @param session - Optional MongoDB session
   * @returns Promise resolving to created case
   */
  async create(
    caseData: Partial<ICase>,
    userId: string,
    session?: ClientSession
  ): Promise<ICase> {
    try {
      // Validate creation permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'CREATE',
        resource: 'cases'
      });

      // Validate security classification
      await this.securityValidator.validateClassificationAccess(
        userId,
        caseData.securityClassification
      );

      // Create case with audit trail
      const caseDoc = new this.caseModel({
        ...caseData,
        createdBy: userId,
        updatedBy: userId,
        auditTrail: [{
          timestamp: new Date(),
          action: 'CREATED',
          userId,
          details: { source: 'case-repository' }
        }]
      });

      // Save with optional session
      const savedCase = await caseDoc.save({ session });

      // Log creation in CJIS format
      await this.auditLogger.logCreate({
        action: 'CREATE_CASE',
        userId,
        resource: 'cases',
        resourceId: savedCase.id,
        details: { classification: savedCase.securityClassification }
      });

      return savedCase;
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
   * Updates a case with security validation
   * @param id - Case ID to update
   * @param caseData - Updated case data
   * @param userId - ID of updating user
   * @param session - Optional MongoDB session
   * @returns Promise resolving to updated case
   */
  async update(
    id: string,
    caseData: Partial<ICase>,
    userId: string,
    session?: ClientSession
  ): Promise<ICase> {
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

      // Update with audit trail
      const updatedCase = await this.caseModel.findByIdAndUpdate(
        id,
        {
          ...caseData,
          updatedBy: userId,
          $push: {
            auditTrail: {
              timestamp: new Date(),
              action: 'UPDATED',
              userId,
              details: { source: 'case-repository' }
            }
          }
        },
        { new: true, session }
      ).exec();

      if (!updatedCase) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Log modification in CJIS format
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
   * Deletes a case with security validation
   * @param id - Case ID to delete
   * @param userId - ID of deleting user
   * @param session - Optional MongoDB session
   * @returns Promise resolving to deletion status
   */
  async delete(
    id: string,
    userId: string,
    session?: ClientSession
  ): Promise<boolean> {
    try {
      // Validate deletion permissions
      await this.securityValidator.validateAccess({
        userId,
        action: 'DELETE',
        resource: 'cases',
        resourceId: id
      });

      // Check case sensitivity
      const caseDoc = await this.caseModel.findById(id).exec();
      if (!caseDoc) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      if (caseDoc.securityClassification === 'RESTRICTED') {
        throw new Error(SecurityErrorCodes.INSUFFICIENT_CLEARANCE);
      }

      // Create deletion audit trail
      await this.auditLogger.logDelete({
        action: 'DELETE_CASE',
        userId,
        resource: 'cases',
        resourceId: id,
        details: {
          classification: caseDoc.securityClassification,
          status: caseDoc.status
        }
      });

      // Execute deletion
      const result = await this.caseModel.deleteOne(
        { _id: id },
        { session }
      ).exec();

      return result.deletedCount === 1;
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