/**
 * @file Error code and message constants for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant error codes and messages
 * with comprehensive coverage for system, validation, authentication, and security errors
 */

/**
 * HTTP status codes used across the application
 */
export const HTTP_STATUS_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_SERVER: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * System-level error codes including FedRAMP and CJIS specific errors
 */
export enum SystemErrorCodes {
  INTERNAL_SERVER_ERROR = 'SYS_001',
  SERVICE_UNAVAILABLE = 'SYS_002',
  RATE_LIMIT_EXCEEDED = 'SYS_003',
  ENCRYPTION_ERROR = 'SYS_004',
  AUDIT_LOG_ERROR = 'SYS_005',
}

/**
 * Validation-specific error codes for input and evidence processing
 */
export enum ValidationErrorCodes {
  INVALID_INPUT = 'VAL_001',
  MISSING_REQUIRED_FIELD = 'VAL_002',
  INVALID_FORMAT = 'VAL_003',
  INVALID_EVIDENCE_FORMAT = 'VAL_004',
  INVALID_CHAIN_OF_CUSTODY = 'VAL_005',
  INVALID_CLASSIFICATION = 'VAL_006',
}

/**
 * Authentication and authorization error codes with security compliance
 */
export enum AuthErrorCodes {
  INVALID_CREDENTIALS = 'AUTH_001',
  TOKEN_EXPIRED = 'AUTH_002',
  INVALID_TOKEN = 'AUTH_003',
  MFA_REQUIRED = 'AUTH_004',
  INSUFFICIENT_CLEARANCE = 'AUTH_005',
  ACCESS_DENIED = 'AUTH_006',
  SESSION_EXPIRED = 'AUTH_007',
}

/**
 * Security-specific error codes for encryption and integrity checks
 */
export enum SecurityErrorCodes {
  ENCRYPTION_FAILED = 'SEC_001',
  DECRYPTION_FAILED = 'SEC_002',
  INTEGRITY_CHECK_FAILED = 'SEC_003',
  AUDIT_LOG_TAMPERED = 'SEC_004',
}

/**
 * Security-compliant, non-revealing error messages mapped to error codes
 * Messages follow FedRAMP and CJIS guidelines for secure error reporting
 */
export const ErrorMessages: Record<string, string> = {
  // System Error Messages
  [SystemErrorCodes.INTERNAL_SERVER_ERROR]: 'An internal system error occurred. Please contact support.',
  [SystemErrorCodes.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable. Please try again later.',
  [SystemErrorCodes.RATE_LIMIT_EXCEEDED]: 'Request rate limit exceeded. Please reduce request frequency.',
  [SystemErrorCodes.ENCRYPTION_ERROR]: 'A security operation failed. Please contact support.',
  [SystemErrorCodes.AUDIT_LOG_ERROR]: 'An audit logging error occurred. Please contact support.',

  // Validation Error Messages
  [ValidationErrorCodes.INVALID_INPUT]: 'The provided input is invalid. Please review and try again.',
  [ValidationErrorCodes.MISSING_REQUIRED_FIELD]: 'Required information is missing. Please complete all required fields.',
  [ValidationErrorCodes.INVALID_FORMAT]: 'The provided format is invalid. Please check the requirements.',
  [ValidationErrorCodes.INVALID_EVIDENCE_FORMAT]: 'The evidence format is not supported. Please check acceptable formats.',
  [ValidationErrorCodes.INVALID_CHAIN_OF_CUSTODY]: 'Chain of custody validation failed. Please verify the evidence trail.',
  [ValidationErrorCodes.INVALID_CLASSIFICATION]: 'Invalid classification level. Please verify access requirements.',

  // Authentication Error Messages
  [AuthErrorCodes.INVALID_CREDENTIALS]: 'Authentication failed. Please verify your credentials.',
  [AuthErrorCodes.TOKEN_EXPIRED]: 'Your session has expired. Please authenticate again.',
  [AuthErrorCodes.INVALID_TOKEN]: 'Invalid authentication token. Please log in again.',
  [AuthErrorCodes.MFA_REQUIRED]: 'Multi-factor authentication is required.',
  [AuthErrorCodes.INSUFFICIENT_CLEARANCE]: 'Insufficient security clearance for requested operation.',
  [AuthErrorCodes.ACCESS_DENIED]: 'Access denied. Please verify your permissions.',
  [AuthErrorCodes.SESSION_EXPIRED]: 'Your session has expired. Please log in again.',

  // Security Error Messages
  [SecurityErrorCodes.ENCRYPTION_FAILED]: 'A security operation failed. Please contact support.',
  [SecurityErrorCodes.DECRYPTION_FAILED]: 'Unable to process secured data. Please contact support.',
  [SecurityErrorCodes.INTEGRITY_CHECK_FAILED]: 'Data integrity verification failed. Please contact support.',
  [SecurityErrorCodes.AUDIT_LOG_TAMPERED]: 'Security audit inconsistency detected. Please contact support.',
} as const;

/**
 * Type guard to check if a string is a valid error code
 */
export const isValidErrorCode = (code: string): boolean => {
  return Object.values({
    ...SystemErrorCodes,
    ...ValidationErrorCodes,
    ...AuthErrorCodes,
    ...SecurityErrorCodes,
  }).includes(code);
};

/**
 * Get error message for a given error code
 */
export const getErrorMessage = (code: string): string => {
  return ErrorMessages[code] || ErrorMessages[SystemErrorCodes.INTERNAL_SERVER_ERROR];
};