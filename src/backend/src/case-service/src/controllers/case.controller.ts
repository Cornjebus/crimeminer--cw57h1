/**
 * @file Case management REST API controller with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Implements secure case management endpoints with comprehensive
 * audit logging, access control, and chain of custody tracking
 */

import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  UseInterceptors,
  HttpStatus,
  ValidationPipe
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiSecurity, 
  ApiBearerAuth 
} from '@nestjs/swagger';
import { SecurityService } from '@crimeminer/security'; // v1.0.0
import { AuditService } from '@crimeminer/audit'; // v1.0.0
import { CaseService } from '../services/case.service';
import { 
  ICase, 
  ICaseCreateRequest, 
  ICaseUpdateRequest, 
  ICaseResponse,
  SecurityClassification 
} from '../interfaces/case.interface';
import { SecurityGuard } from '../../../common/guards/security.guard';
import { AuditInterceptor } from '../../../common/interceptors/audit.interceptor';
import { ValidationErrorCodes, SecurityErrorCodes } from '../../../common/constants/error-codes';

@Controller('cases')
@ApiTags('Cases')
@ApiBearerAuth()
@ApiSecurity('fedramp-high')
@UseGuards(SecurityGuard)
@UseInterceptors(AuditInterceptor)
export class CaseController {
  constructor(
    private readonly caseService: CaseService,
    private readonly securityService: SecurityService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Retrieves all cases with security filtering and access control
   */
  @Get()
  @ApiOperation({ summary: 'Get all cases with security controls' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Cases retrieved successfully with security metadata',
    type: [ICaseResponse]
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied - Insufficient clearance' 
  })
  async getCases(@Query(ValidationPipe) query: Record<string, any>): Promise<ICaseResponse[]> {
    const userId = await this.securityService.getCurrentUserId();
    
    // Validate security clearance
    await this.securityService.validateClearance(userId, SecurityClassification.CONFIDENTIAL);

    // Log access attempt
    await this.auditService.logAccess({
      action: 'LIST_CASES',
      userId,
      resource: 'cases',
      details: { query }
    });

    const cases = await this.caseService.getCases(query, userId);

    // Enhance response with security metadata
    return cases.map(caseItem => ({
      case: caseItem,
      securityMetadata: {
        classificationLevel: caseItem.securityClassification,
        encryptedFields: caseItem.encryptedFields,
        accessControl: caseItem.accessControl,
        auditToken: this.securityService.generateAuditToken(caseItem.id),
        integrityHash: this.securityService.calculateIntegrityHash(caseItem)
      }
    }));
  }

  /**
   * Retrieves a specific case by ID with security validation
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get case by ID with security controls' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Case retrieved successfully with security metadata',
    type: ICaseResponse
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied or insufficient clearance' 
  })
  async getCaseById(@Param('id') id: string): Promise<ICaseResponse> {
    const userId = await this.securityService.getCurrentUserId();

    // Validate case access
    await this.securityService.validateCaseAccess(id, userId);

    // Log access attempt
    await this.auditService.logAccess({
      action: 'VIEW_CASE',
      userId,
      resource: 'cases',
      resourceId: id
    });

    const caseData = await this.caseService.getCaseById(id, userId);

    return {
      case: caseData,
      securityMetadata: {
        classificationLevel: caseData.securityClassification,
        encryptedFields: caseData.encryptedFields,
        accessControl: caseData.accessControl,
        auditToken: this.securityService.generateAuditToken(id),
        integrityHash: this.securityService.calculateIntegrityHash(caseData)
      }
    };
  }

  /**
   * Creates a new case with security controls
   */
  @Post()
  @ApiOperation({ summary: 'Create new case with security controls' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Case created successfully with security metadata',
    type: ICaseResponse
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied or insufficient clearance' 
  })
  async createCase(@Body(ValidationPipe) createRequest: ICaseCreateRequest): Promise<ICaseResponse> {
    const userId = await this.securityService.getCurrentUserId();

    // Validate creation permissions
    await this.securityService.validateCaseCreation(userId, createRequest.securityClassification);

    // Log creation attempt
    await this.auditService.logCreate({
      action: 'CREATE_CASE',
      userId,
      resource: 'cases',
      details: createRequest
    });

    const createdCase = await this.caseService.createCase(createRequest, userId);

    return {
      case: createdCase,
      securityMetadata: {
        classificationLevel: createdCase.securityClassification,
        encryptedFields: createdCase.encryptedFields,
        accessControl: createdCase.accessControl,
        auditToken: this.securityService.generateAuditToken(createdCase.id),
        integrityHash: this.securityService.calculateIntegrityHash(createdCase)
      }
    };
  }

  /**
   * Updates an existing case with security validation
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update case with security controls' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Case updated successfully with security metadata',
    type: ICaseResponse
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied or insufficient clearance' 
  })
  async updateCase(
    @Param('id') id: string,
    @Body(ValidationPipe) updateRequest: ICaseUpdateRequest
  ): Promise<ICaseResponse> {
    const userId = await this.securityService.getCurrentUserId();

    // Validate update permissions
    await this.securityService.validateCaseUpdate(id, userId, updateRequest.securityClassification);

    // Log update attempt
    await this.auditService.logUpdate({
      action: 'UPDATE_CASE',
      userId,
      resource: 'cases',
      resourceId: id,
      details: updateRequest
    });

    const updatedCase = await this.caseService.updateCase(id, updateRequest, userId);

    return {
      case: updatedCase,
      securityMetadata: {
        classificationLevel: updatedCase.securityClassification,
        encryptedFields: updatedCase.encryptedFields,
        accessControl: updatedCase.accessControl,
        auditToken: this.securityService.generateAuditToken(id),
        integrityHash: this.securityService.calculateIntegrityHash(updatedCase)
      }
    };
  }

  /**
   * Deletes a case with security checks
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete case with security controls' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Case deleted successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied or insufficient clearance' 
  })
  async deleteCase(@Param('id') id: string): Promise<void> {
    const userId = await this.securityService.getCurrentUserId();

    // Validate deletion permissions
    await this.securityService.validateCaseDeletion(id, userId);

    // Log deletion attempt
    await this.auditService.logDelete({
      action: 'DELETE_CASE',
      userId,
      resource: 'cases',
      resourceId: id
    });

    await this.caseService.deleteCase(id, userId);
  }
}