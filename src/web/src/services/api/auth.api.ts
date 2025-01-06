/**
 * Authentication API service implementing FedRAMP High and CJIS compliant
 * authentication flows with comprehensive security validation and audit logging.
 * @version 1.0.0
 */

import { AxiosResponse } from 'axios'; // v1.6.0
import {
  LoginRequest,
  LoginResponse,
  User,
  AuthState,
  SecurityClearanceLevel
} from '../../types/auth.types';
import apiClient from '../../config/api.config';
import {
  setAuthTokens,
  clearAuthTokens,
  encryptToken,
  validateSecurityContext
} from '../../utils/auth.util';
import { API_ENDPOINTS, API_HEADERS, API_ERROR_CODES } from '../../constants/api.constants';

/**
 * Authenticates user with enhanced security validation and compliance tracking
 * @param credentials User login credentials
 * @param securityContext Security context for validation
 * @returns Promise resolving to login response with security context
 */
export const login = async (
  credentials: LoginRequest,
  securityContext: SecurityContext
): Promise<LoginResponse> => {
  try {
    // Generate request tracing ID
    const requestId = crypto.randomUUID();

    // Add compliance and security headers
    const headers = {
      [API_HEADERS.REQUEST_ID]: requestId,
      [API_HEADERS.COMPLIANCE_LEVEL]: 'FEDRAMP_HIGH',
      [API_HEADERS.CLASSIFICATION_LEVEL]: 'RESTRICTED',
      [API_HEADERS.AGENCY_ID]: securityContext.agencyId,
      [API_HEADERS.JURISDICTION]: securityContext.jurisdiction
    };

    // Make login request with enhanced security
    const response: AxiosResponse<LoginResponse> = await apiClient.post(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials,
      { headers }
    );

    // Handle MFA requirement
    if (response.data.mfaRequired) {
      return {
        ...response.data,
        mfaRequired: true,
        sessionId: requestId
      };
    }

    // Validate security clearance
    if (!validateSecurityContext(response.data.user.securityClearance)) {
      throw new Error(API_ERROR_CODES.ACCESS_DENIED);
    }

    // Store encrypted tokens
    await setAuthTokens(response.data);

    return response.data;

  } catch (error: any) {
    throw {
      code: error.code || API_ERROR_CODES.UNAUTHORIZED,
      message: error.message,
      requestId: error.config?.headers?.[API_HEADERS.REQUEST_ID]
    };
  }
};

/**
 * Validates MFA with enhanced security and compliance tracking
 * @param mfaCode MFA verification code
 * @param sessionToken Temporary session token
 * @param securityContext Security context for validation
 * @returns Promise resolving to login response after MFA validation
 */
export const validateMfa = async (
  mfaCode: string,
  sessionToken: string,
  securityContext: SecurityContext
): Promise<LoginResponse> => {
  try {
    // Generate request tracing ID
    const requestId = crypto.randomUUID();

    // Add compliance headers
    const headers = {
      [API_HEADERS.REQUEST_ID]: requestId,
      [API_HEADERS.SESSION_ID]: sessionToken,
      [API_HEADERS.COMPLIANCE_LEVEL]: 'FEDRAMP_HIGH',
      [API_HEADERS.CLASSIFICATION_LEVEL]: 'RESTRICTED'
    };

    // Validate MFA
    const response: AxiosResponse<LoginResponse> = await apiClient.post(
      API_ENDPOINTS.AUTH.MFA,
      { mfaCode },
      { headers }
    );

    // Validate security context
    if (!validateSecurityContext(response.data.user.securityClearance)) {
      throw new Error(API_ERROR_CODES.ACCESS_DENIED);
    }

    // Store encrypted tokens
    await setAuthTokens(response.data);

    return response.data;

  } catch (error: any) {
    throw {
      code: error.code || API_ERROR_CODES.UNAUTHORIZED,
      message: error.message,
      requestId: error.config?.headers?.[API_HEADERS.REQUEST_ID]
    };
  }
};

/**
 * Refreshes authentication tokens with security validation
 * @param refreshToken Current refresh token
 * @param securityContext Security context for validation
 * @returns Promise resolving to new authentication tokens
 */
export const refreshToken = async (
  refreshToken: string,
  securityContext: SecurityContext
): Promise<LoginResponse> => {
  try {
    // Generate request tracing ID
    const requestId = crypto.randomUUID();

    // Add compliance headers
    const headers = {
      [API_HEADERS.REQUEST_ID]: requestId,
      [API_HEADERS.COMPLIANCE_LEVEL]: 'FEDRAMP_HIGH',
      [API_HEADERS.CLASSIFICATION_LEVEL]: 'RESTRICTED'
    };

    // Encrypt refresh token
    const encryptedToken = await encryptToken(refreshToken);

    // Request new tokens
    const response: AxiosResponse<LoginResponse> = await apiClient.post(
      API_ENDPOINTS.AUTH.REFRESH,
      { refreshToken: encryptedToken },
      { headers }
    );

    // Validate security clearance
    if (!validateSecurityContext(response.data.user.securityClearance)) {
      throw new Error(API_ERROR_CODES.ACCESS_DENIED);
    }

    // Store new tokens
    await setAuthTokens(response.data);

    return response.data;

  } catch (error: any) {
    throw {
      code: error.code || API_ERROR_CODES.UNAUTHORIZED,
      message: error.message,
      requestId: error.config?.headers?.[API_HEADERS.REQUEST_ID]
    };
  }
};

/**
 * Logs out user with secure session cleanup and audit logging
 * @returns Promise resolving when logout is complete
 */
export const logout = async (): Promise<void> => {
  try {
    // Generate request tracing ID
    const requestId = crypto.randomUUID();

    // Add compliance headers
    const headers = {
      [API_HEADERS.REQUEST_ID]: requestId,
      [API_HEADERS.COMPLIANCE_LEVEL]: 'FEDRAMP_HIGH',
      [API_HEADERS.CLASSIFICATION_LEVEL]: 'RESTRICTED'
    };

    // Request server-side logout
    await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT, {}, { headers });

    // Clear local tokens and session
    await clearAuthTokens();

  } catch (error: any) {
    // Always clear local state even if server logout fails
    await clearAuthTokens();
    
    throw {
      code: error.code || API_ERROR_CODES.SERVER_ERROR,
      message: error.message,
      requestId: error.config?.headers?.[API_HEADERS.REQUEST_ID]
    };
  }
};