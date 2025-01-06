/**
 * @file Authentication request validator for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant validation rules for authentication
 * with comprehensive security controls and compliance checks
 */

import { IsString, IsNotEmpty, Length, Matches } from 'class-validator'; // v0.14.0
import { BaseValidator } from '../../../common/validators/base.validator';
import { IAuthRequest, IMfaRequest } from '../interfaces/auth.interface';
import { ValidationErrorCodes, AuthErrorCodes } from '../../../common/constants/error-codes';
import { IErrorResponse } from '../../../common/interfaces/base.interface';

/**
 * Authentication validator implementing FedRAMP High and CJIS compliant validation rules
 */
export class AuthValidator extends BaseValidator {
  // FedRAMP High compliant password requirements
  private readonly PASSWORD_PATTERN = 
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{15,128}$/;

  // CJIS compliant username requirements
  private readonly USERNAME_PATTERN = /^[a-zA-Z0-9._-]{8,64}$/;

  // MFA code validation pattern
  private readonly MFA_CODE_PATTERN = /^[0-9]{6}$/;

  // Maximum failed validation attempts before temporary lockout
  private readonly MAX_VALIDATION_ATTEMPTS = 5;

  // Validation attempt tracking
  private validationAttempts: Map<string, number> = new Map();
  private lockoutTimestamps: Map<string, Date> = new Map();

  constructor() {
    super();
    this.initializeSecurityContext();
  }

  /**
   * Validates authentication request with FedRAMP High and CJIS compliance checks
   * @param request Authentication request to validate
   * @returns Validated request or error response
   */
  async validateAuthRequest(request: IAuthRequest): Promise<IAuthRequest | IErrorResponse> {
    try {
      // Check for lockout
      if (this.isValidationLocked(request.clientInfo.ipAddress)) {
        return this.buildErrorResponse([{
          property: 'authentication',
          constraints: {
            locked: AuthErrorCodes.ACCESS_DENIED
          }
        }]);
      }

      // Validate request context
      const baseValidation = await this.validateRequest(
        IAuthRequest as any,
        request
      );

      if ('error' in baseValidation) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return baseValidation;
      }

      // Validate username
      if (!this.USERNAME_PATTERN.test(request.username)) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return this.buildErrorResponse([{
          property: 'username',
          constraints: {
            pattern: ValidationErrorCodes.INVALID_FORMAT
          }
        }]);
      }

      // Validate password complexity
      if (!this.PASSWORD_PATTERN.test(request.password)) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return this.buildErrorResponse([{
          property: 'password',
          constraints: {
            complexity: ValidationErrorCodes.INVALID_FORMAT
          }
        }]);
      }

      // Validate MFA code if provided
      if (request.mfaCode && !this.MFA_CODE_PATTERN.test(request.mfaCode)) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return this.buildErrorResponse([{
          property: 'mfaCode',
          constraints: {
            pattern: ValidationErrorCodes.INVALID_FORMAT
          }
        }]);
      }

      // Reset validation attempts on successful validation
      this.resetValidationAttempts(request.clientInfo.ipAddress);

      return request;
    } catch (error) {
      return this.buildErrorResponse([{
        property: 'validation',
        constraints: {
          processing: ValidationErrorCodes.INVALID_INPUT
        }
      }]);
    }
  }

  /**
   * Validates MFA verification request with CJIS compliance checks
   * @param request MFA verification request to validate
   * @returns Validated request or error response
   */
  async validateMfaRequest(request: IMfaRequest): Promise<IMfaRequest | IErrorResponse> {
    try {
      // Check for lockout
      if (this.isValidationLocked(request.clientInfo.ipAddress)) {
        return this.buildErrorResponse([{
          property: 'mfa',
          constraints: {
            locked: AuthErrorCodes.ACCESS_DENIED
          }
        }]);
      }

      // Validate request context
      const baseValidation = await this.validateRequest(
        IMfaRequest as any,
        request
      );

      if ('error' in baseValidation) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return baseValidation;
      }

      // Validate MFA code format
      if (!this.MFA_CODE_PATTERN.test(request.mfaCode)) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return this.buildErrorResponse([{
          property: 'mfaCode',
          constraints: {
            pattern: ValidationErrorCodes.INVALID_FORMAT
          }
        }]);
      }

      // Validate temporary token
      if (!request.tempToken || request.tempToken.length < 32) {
        this.incrementValidationAttempts(request.clientInfo.ipAddress);
        return this.buildErrorResponse([{
          property: 'tempToken',
          constraints: {
            invalid: AuthErrorCodes.INVALID_TOKEN
          }
        }]);
      }

      // Reset validation attempts on successful validation
      this.resetValidationAttempts(request.clientInfo.ipAddress);

      return request;
    } catch (error) {
      return this.buildErrorResponse([{
        property: 'validation',
        constraints: {
          processing: ValidationErrorCodes.INVALID_INPUT
        }
      }]);
    }
  }

  /**
   * Initializes security context for validation
   */
  private initializeSecurityContext(): void {
    this.securityContext.set('validatorType', 'AUTH');
    this.securityContext.set('complianceLevel', 'FEDRAMP_HIGH');
    this.securityContext.set('auditEnabled', true);
  }

  /**
   * Checks if validation is locked for an IP address
   */
  private isValidationLocked(ipAddress: string): boolean {
    const lockoutTimestamp = this.lockoutTimestamps.get(ipAddress);
    if (lockoutTimestamp && lockoutTimestamp > new Date()) {
      return true;
    }
    return false;
  }

  /**
   * Increments validation attempts and implements lockout if threshold exceeded
   */
  private incrementValidationAttempts(ipAddress: string): void {
    const attempts = (this.validationAttempts.get(ipAddress) || 0) + 1;
    this.validationAttempts.set(ipAddress, attempts);

    if (attempts >= this.MAX_VALIDATION_ATTEMPTS) {
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + 30);
      this.lockoutTimestamps.set(ipAddress, lockoutUntil);
    }
  }

  /**
   * Resets validation attempts for an IP address
   */
  private resetValidationAttempts(ipAddress: string): void {
    this.validationAttempts.delete(ipAddress);
    this.lockoutTimestamps.delete(ipAddress);
  }
}