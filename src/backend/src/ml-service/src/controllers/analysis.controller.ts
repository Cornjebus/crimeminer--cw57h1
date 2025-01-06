/**
 * @file Analysis controller for CrimeMiner ML service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant REST endpoints for ML analysis
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  Headers,
  Query
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader
} from '@nestjs/swagger';
import { JwtAuthGuard, RateLimit } from '@nestjs/passport';
import {
  IAnalysisRequest,
  IAnalysisResult,
  EvidenceMediaType,
  AnalysisType
} from '../interfaces/analysis.interface';
import { AnalysisService } from '../services/analysis.service';
import { BaseValidator } from '../../../common/validators/base.validator';
import { AuditLogInterceptor } from '../../../common/interceptors/audit-log.interceptor';
import { SecurityClassificationGuard } from '../../../common/guards/security-classification.guard';
import { ValidationErrorCodes, SecurityErrorCodes } from '../../../common/constants/error-codes';

@Controller('analysis')
@ApiTags('Analysis')
@UseGuards(JwtAuthGuard, SecurityClassificationGuard)
@ApiSecurity('jwt')
@UseInterceptors(AuditLogInterceptor)
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly validator: BaseValidator
  ) {}

  /**
   * Initiate analysis of evidence with comprehensive security validation
   */
  @Post()
  @ApiOperation({
    summary: 'Initiate evidence analysis',
    description: 'Start analysis of evidence with CJIS-compliant security controls'
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Analysis initiated successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request parameters' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions' })
  @ApiHeader({ name: 'X-Security-Context', required: true })
  @RateLimit({ limit: 100, windowMs: 60000 }) // 100 requests per minute
  async initiateAnalysis(
    @Body() request: IAnalysisRequest,
    @Headers('x-security-context') securityContext: string
  ): Promise<IAnalysisResult[]> {
    // Validate security context
    await this.validator.validateSecurityHeaders(securityContext);

    // Validate request with CJIS compliance
    const validationResult = await this.validator.validateRequest(request);
    if (!validationResult.success) {
      throw new Error(ValidationErrorCodes.INVALID_INPUT);
    }

    // Validate compliance requirements
    await this.validator.validateComplianceRequirements(request);

    // Process analysis request
    return this.analysisService.analyzeEvidence(request);
  }

  /**
   * Retrieve analysis results with security validation
   */
  @Get(':evidenceId')
  @ApiOperation({
    summary: 'Get analysis results',
    description: 'Retrieve analysis results with security controls'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Results retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Results not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  @ApiHeader({ name: 'X-Security-Context', required: true })
  async getResults(
    @Param('evidenceId') evidenceId: string,
    @Headers('x-security-context') securityContext: string
  ): Promise<IAnalysisResult[]> {
    // Validate security context
    await this.validator.validateSecurityHeaders(securityContext);

    // Validate evidence ID
    if (!evidenceId) {
      throw new Error(ValidationErrorCodes.MISSING_REQUIRED_FIELD);
    }

    // Get results with security validation
    return this.analysisService.getAnalysisResults(evidenceId);
  }

  /**
   * Cancel ongoing analysis with security validation
   */
  @Delete(':evidenceId')
  @ApiOperation({
    summary: 'Cancel analysis',
    description: 'Cancel ongoing analysis with security validation'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Analysis cancelled successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Analysis not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  @ApiHeader({ name: 'X-Security-Context', required: true })
  async cancelAnalysis(
    @Param('evidenceId') evidenceId: string,
    @Headers('x-security-context') securityContext: string
  ): Promise<void> {
    // Validate security context
    await this.validator.validateSecurityHeaders(securityContext);

    // Validate evidence ID
    if (!evidenceId) {
      throw new Error(ValidationErrorCodes.MISSING_REQUIRED_FIELD);
    }

    // Cancel analysis with security validation
    await this.analysisService.cancelAnalysis(evidenceId);
  }

  /**
   * Get analysis status with security validation
   */
  @Get(':evidenceId/status')
  @ApiOperation({
    summary: 'Get analysis status',
    description: 'Check status of analysis with security controls'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Status retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Analysis not found' })
  @ApiHeader({ name: 'X-Security-Context', required: true })
  async getAnalysisStatus(
    @Param('evidenceId') evidenceId: string,
    @Headers('x-security-context') securityContext: string
  ): Promise<{ status: string; progress?: number }> {
    // Validate security context
    await this.validator.validateSecurityHeaders(securityContext);

    // Get status with security validation
    return this.analysisService.getAnalysisStatus(evidenceId);
  }

  /**
   * Batch analysis request with security validation
   */
  @Post('batch')
  @ApiOperation({
    summary: 'Batch analysis request',
    description: 'Process multiple evidence items with security controls'
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Batch analysis initiated' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request' })
  @ApiHeader({ name: 'X-Security-Context', required: true })
  @RateLimit({ limit: 10, windowMs: 60000 }) // 10 batch requests per minute
  async batchAnalysis(
    @Body() requests: IAnalysisRequest[],
    @Headers('x-security-context') securityContext: string
  ): Promise<{ batchId: string }> {
    // Validate security context
    await this.validator.validateSecurityHeaders(securityContext);

    // Validate batch request
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error(ValidationErrorCodes.INVALID_INPUT);
    }

    // Process batch with security validation
    return this.analysisService.processBatchAnalysis(requests);
  }
}