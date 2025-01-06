/**
 * @file Base validator class for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant validation functionality
 * with comprehensive security controls and audit trails
 */

import { validate, ValidationError } from 'class-validator'; // v0.14.0
import { plainToClass } from 'class-transformer'; // v0.5.1
import { ValidationErrorCodes } from '../constants/error-codes';
import { 
  IBaseRequest, 
  IErrorResponse, 
  IErrorDetails,
  ErrorSeverity,
  IAuditEntry
} from '../interfaces/base.interface';

/**
 * Security-enhanced validation options following FedRAMP requirements
 */
interface IValidationOptions {
  skipMissingProperties: boolean;
  whitelist: boolean;
  forbidNonWhitelisted: boolean;
  forbidUnknownValues: boolean;
  validationError: {
    target: boolean;
    value: boolean;
  };
}

/**
 * Base validator class providing FedRAMP High and CJIS compliant validation
 * functionality with comprehensive security controls and audit trails
 */
export abstract class BaseValidator {
  protected readonly validationOptions: IValidationOptions;
  protected readonly securityContext: Map<string, any>;
  protected readonly auditTrail: IAuditEntry[];

  constructor() {
    // Initialize FedRAMP compliant validation options
    this.validationOptions = {
      skipMissingProperties: false,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: {
        target: false,
        value: false
      }
    };

    this.securityContext = new Map();
    this.auditTrail = [];
  }

  /**
   * Validates an incoming API request against its DTO class with security checks
   * @param dtoClass - The DTO class to validate against
   * @param requestBody - The request body to validate
   * @returns Validated DTO object or security-enhanced error response
   */
  async validateRequest<T extends IBaseRequest>(
    dtoClass: { new(): T },
    requestBody: any
  ): Promise<T | IErrorResponse> {
    try {
      // Validate request security context
      if (!requestBody.requestId || !requestBody.timestamp) {
        return this.buildErrorResponse([{
          property: 'requestContext',
          constraints: {
            isRequired: ValidationErrorCodes.MISSING_REQUIRED_FIELD
          }
        }]);
      }

      // Sanitize input data by transforming to class instance
      const transformedData = plainToClass(dtoClass, requestBody, {
        excludeExtraneousValues: true,
        enableImplicitConversion: false
      });

      // Validate using FedRAMP compliant rules
      const validationErrors = await validate(transformedData, this.validationOptions);

      if (validationErrors.length > 0) {
        return this.buildErrorResponse(validationErrors);
      }

      // Generate audit trail entry
      this.auditTrail.push({
        timestamp: new Date(),
        action: 'VALIDATE_REQUEST',
        userId: requestBody.userId || 'SYSTEM',
        details: {
          requestId: requestBody.requestId,
          validationType: dtoClass.name
        },
        ipAddress: requestBody.clientInfo?.ipAddress || 'UNKNOWN',
        sessionId: requestBody.sessionId || 'UNKNOWN'
      });

      return transformedData;
    } catch (error) {
      return this.buildErrorResponse([{
        property: 'validation',
        constraints: {
          processingError: ValidationErrorCodes.INVALID_INPUT
        }
      }]);
    }
  }

  /**
   * Validates a database entity before persistence with CJIS compliance checks
   * @param entity - The entity to validate
   * @returns Validation result with compliance status
   */
  async validateEntity<T>(entity: T): Promise<boolean> {
    try {
      // Verify entity integrity
      const validationErrors = await validate(entity, this.validationOptions);

      if (validationErrors.length > 0) {
        return false;
      }

      // Generate audit trail entry
      this.auditTrail.push({
        timestamp: new Date(),
        action: 'VALIDATE_ENTITY',
        userId: 'SYSTEM',
        details: {
          entityType: entity.constructor.name,
          entityId: (entity as any).id
        },
        ipAddress: 'INTERNAL',
        sessionId: 'SYSTEM'
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Builds security-enhanced error response from validation errors
   * @param errors - Array of validation errors
   * @returns Security-enhanced error response with audit context
   */
  protected buildErrorResponse(errors: ValidationError[]): IErrorResponse {
    const errorDetails: IErrorDetails = {
      code: ValidationErrorCodes.INVALID_INPUT,
      message: 'Validation failed',
      details: {},
      source: 'BaseValidator',
      timestamp: new Date(),
      stackTrace: ''
    };

    // Sanitize and structure error messages
    errors.forEach(error => {
      if (error.constraints) {
        errorDetails.details[error.property] = Object.values(error.constraints)[0];
      }
    });

    // Generate audit token
    const auditToken = Buffer.from(JSON.stringify({
      timestamp: new Date().toISOString(),
      errorCount: errors.length,
      validatorId: this.constructor.name
    })).toString('base64');

    return {
      success: false,
      requestId: this.securityContext.get('requestId') || 'UNKNOWN',
      timestamp: new Date(),
      processingTime: 0,
      error: errorDetails,
      incidentId: `VAL-${Date.now()}`,
      severity: ErrorSeverity.ERROR,
      auditToken
    };
  }
}