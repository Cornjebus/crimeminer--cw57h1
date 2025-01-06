/**
 * @file Authentication controller for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant authentication endpoints
 * with comprehensive security controls and audit logging
 */

import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  UseGuards 
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { 
  IAuthRequest, 
  IMfaRequest 
} from '../interfaces/auth.interface';
import { Logger } from '@nestjs/common'; // v10.0.0
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { InputValidationGuard } from '../guards/input-validation.guard';
import { MfaGuard } from '../guards/mfa.guard';
import { TokenGuard } from '../guards/token.guard';
import { IBaseResponse, IErrorResponse } from '../../../common/interfaces/base.interface';
import { AuthErrorCodes } from '../../../common/constants/error-codes';

/**
 * Authentication controller implementing FedRAMP High and CJIS compliant endpoints
 * for user authentication, MFA verification, and token management
 */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  private readonly AUDIT_PREFIX = 'AUTH_CTRL';

  constructor(
    private readonly authService: AuthService,
    private readonly logger: Logger
  ) {
    this.logger.setContext('AuthController');
  }

  /**
   * Handles initial authentication with comprehensive security controls
   * @param request Authentication request with credentials
   * @returns Authentication response with tokens or MFA requirement
   */
  @Post('login')
  @HttpCode(200)
  @UseGuards(InputValidationGuard)
  async login(@Body() request: IAuthRequest): Promise<IBaseResponse> {
    try {
      // Log authentication attempt with security context
      this.logger.log({
        message: 'Authentication attempt',
        requestId: request.requestId,
        username: request.username,
        ipAddress: request.clientInfo.ipAddress,
        userAgent: request.clientInfo.userAgent,
        timestamp: new Date()
      });

      // Forward to authentication service
      const authResponse = await this.authService.authenticate(request);

      // Log authentication result
      this.logger.log({
        message: 'Authentication result',
        requestId: request.requestId,
        success: authResponse.success,
        mfaRequired: 'mfaRequired' in authResponse ? authResponse.mfaRequired : false,
        timestamp: new Date()
      });

      return authResponse;

    } catch (error) {
      // Log authentication error
      this.logger.error({
        message: 'Authentication error',
        requestId: request.requestId,
        error: error.message,
        timestamp: new Date()
      });

      return {
        success: false,
        requestId: request.requestId,
        timestamp: new Date(),
        processingTime: 0,
        error: {
          code: AuthErrorCodes.INVALID_CREDENTIALS,
          message: 'Authentication failed',
          details: {},
          source: 'AuthController',
          timestamp: new Date(),
          stackTrace: ''
        },
        incidentId: `AUTH-${Date.now()}`,
        severity: 'ERROR',
        auditToken: Buffer.from(JSON.stringify({
          timestamp: new Date(),
          action: 'LOGIN_ERROR'
        })).toString('base64')
      };
    }
  }

  /**
   * Handles MFA verification with security controls and compliance logging
   * @param request MFA verification request
   * @returns Authentication response with final tokens
   */
  @Post('mfa/verify')
  @HttpCode(200)
  @UseGuards(MfaGuard)
  async verifyMfa(@Body() request: IMfaRequest): Promise<IBaseResponse> {
    try {
      // Log MFA verification attempt
      this.logger.log({
        message: 'MFA verification attempt',
        requestId: request.requestId,
        mfaType: request.mfaType,
        ipAddress: request.clientInfo.ipAddress,
        timestamp: new Date()
      });

      // Forward to authentication service
      const mfaResponse = await this.authService.verifyMfa(request);

      // Log MFA verification result
      this.logger.log({
        message: 'MFA verification result',
        requestId: request.requestId,
        success: mfaResponse.success,
        timestamp: new Date()
      });

      return mfaResponse;

    } catch (error) {
      // Log MFA verification error
      this.logger.error({
        message: 'MFA verification error',
        requestId: request.requestId,
        error: error.message,
        timestamp: new Date()
      });

      return {
        success: false,
        requestId: request.requestId,
        timestamp: new Date(),
        processingTime: 0,
        error: {
          code: AuthErrorCodes.INVALID_CREDENTIALS,
          message: 'MFA verification failed',
          details: {},
          source: 'AuthController',
          timestamp: new Date(),
          stackTrace: ''
        },
        incidentId: `MFA-${Date.now()}`,
        severity: 'ERROR',
        auditToken: Buffer.from(JSON.stringify({
          timestamp: new Date(),
          action: 'MFA_ERROR'
        })).toString('base64')
      };
    }
  }

  /**
   * Handles secure token refresh with validation and audit logging
   * @param request Token refresh request
   * @returns Authentication response with new tokens
   */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  async refresh(@Body() request: { refreshToken: string }): Promise<IBaseResponse> {
    try {
      // Log token refresh attempt
      this.logger.log({
        message: 'Token refresh attempt',
        requestId: request.requestId,
        ipAddress: request.clientInfo?.ipAddress,
        timestamp: new Date()
      });

      // Forward to authentication service
      const refreshResponse = await this.authService.refreshToken(request.refreshToken);

      // Log token refresh result
      this.logger.log({
        message: 'Token refresh result',
        requestId: request.requestId,
        success: refreshResponse.success,
        timestamp: new Date()
      });

      return refreshResponse;

    } catch (error) {
      // Log token refresh error
      this.logger.error({
        message: 'Token refresh error',
        requestId: request.requestId,
        error: error.message,
        timestamp: new Date()
      });

      return {
        success: false,
        requestId: request.requestId,
        timestamp: new Date(),
        processingTime: 0,
        error: {
          code: AuthErrorCodes.INVALID_TOKEN,
          message: 'Token refresh failed',
          details: {},
          source: 'AuthController',
          timestamp: new Date(),
          stackTrace: ''
        },
        incidentId: `REFRESH-${Date.now()}`,
        severity: 'ERROR',
        auditToken: Buffer.from(JSON.stringify({
          timestamp: new Date(),
          action: 'REFRESH_ERROR'
        })).toString('base64')
      };
    }
  }

  /**
   * Handles secure token revocation with audit logging
   * @param request Token revocation request
   * @returns Revocation confirmation response
   */
  @Post('revoke')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  async revokeToken(@Body() request: { token: string }): Promise<IBaseResponse> {
    try {
      // Log token revocation attempt
      this.logger.log({
        message: 'Token revocation attempt',
        requestId: request.requestId,
        ipAddress: request.clientInfo?.ipAddress,
        timestamp: new Date()
      });

      // Forward to authentication service
      const revokeResponse = await this.authService.revokeToken(request.token);

      // Log token revocation result
      this.logger.log({
        message: 'Token revocation result',
        requestId: request.requestId,
        success: revokeResponse.success,
        timestamp: new Date()
      });

      return revokeResponse;

    } catch (error) {
      // Log token revocation error
      this.logger.error({
        message: 'Token revocation error',
        requestId: request.requestId,
        error: error.message,
        timestamp: new Date()
      });

      return {
        success: false,
        requestId: request.requestId,
        timestamp: new Date(),
        processingTime: 0,
        error: {
          code: AuthErrorCodes.INVALID_TOKEN,
          message: 'Token revocation failed',
          details: {},
          source: 'AuthController',
          timestamp: new Date(),
          stackTrace: ''
        },
        incidentId: `REVOKE-${Date.now()}`,
        severity: 'ERROR',
        auditToken: Buffer.from(JSON.stringify({
          timestamp: new Date(),
          action: 'REVOKE_ERROR'
        })).toString('base64')
      };
    }
  }
}