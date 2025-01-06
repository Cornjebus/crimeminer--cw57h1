/**
 * Case management API service implementing FedRAMP High and CJIS compliance requirements
 * with enhanced security features and comprehensive audit logging.
 * @version 1.0.0
 */

import { AxiosResponse } from 'axios'; // v1.6.0
import { SecurityUtils } from '@crimeminer/security-utils'; // v1.0.0
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { apiClient } from '../../config/api.config';
import { API_ENDPOINTS, HTTP_METHODS, API_HEADERS } from '../../constants/api.constants';

/**
 * Interface for case list response with pagination
 */
interface CaseListResponse {
  items: Case[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string;
}

/**
 * Interface for single case response
 */
interface CaseResponse {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  createdBy: string;
  metadata: Record<string, unknown>;
  classificationLevel: string;
  chainOfCustody: string[];
}

/**
 * Interface for case creation request
 */
interface CaseCreateRequest {
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  classificationLevel: string;
}

/**
 * Interface for case update request
 */
interface CaseUpdateRequest {
  title?: string;
  description?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  classificationLevel?: string;
}

/**
 * CaseApi class implementing secure case management operations
 */
export class CaseApi {
  private readonly securityUtils: SecurityUtils;
  private readonly auditLogger: AuditLogger;

  constructor() {
    this.securityUtils = new SecurityUtils();
    this.auditLogger = new AuditLogger();
  }

  /**
   * Retrieves a paginated list of cases with security validation
   * @param page Page number for pagination
   * @param limit Number of items per page
   * @returns Promise resolving to paginated case list
   */
  async getCases(page: number = 1, limit: number = 10): Promise<CaseListResponse> {
    try {
      // Validate security context
      await this.securityUtils.validateSecurityContext();

      // Prepare request with security headers
      const headers = await this.prepareSecurityHeaders('GET', API_ENDPOINTS.CASES.BASE);

      // Make API request
      const response: AxiosResponse<CaseListResponse> = await apiClient.get(
        API_ENDPOINTS.CASES.BASE,
        {
          params: { page, limit },
          headers
        }
      );

      // Log audit event
      await this.auditLogger.logApiAccess({
        action: 'LIST_CASES',
        entityType: 'CASE',
        entityId: 'BULK',
        changes: { page, limit }
      });

      return response.data;
    } catch (error) {
      await this.handleApiError(error, 'getCases');
      throw error;
    }
  }

  /**
   * Retrieves a single case by ID with security validation
   * @param id Case identifier
   * @returns Promise resolving to case details
   */
  async getCase(id: string): Promise<CaseResponse> {
    try {
      // Validate case ID
      if (!this.securityUtils.validateId(id)) {
        throw new Error('Invalid case ID');
      }

      // Prepare request with security headers
      const headers = await this.prepareSecurityHeaders('GET', API_ENDPOINTS.CASES.DETAILS(id));

      // Make API request
      const response: AxiosResponse<CaseResponse> = await apiClient.get(
        API_ENDPOINTS.CASES.DETAILS(id),
        { headers }
      );

      // Log audit event
      await this.auditLogger.logApiAccess({
        action: 'GET_CASE',
        entityType: 'CASE',
        entityId: id,
        changes: {}
      });

      return response.data;
    } catch (error) {
      await this.handleApiError(error, 'getCase');
      throw error;
    }
  }

  /**
   * Creates a new case with security validation and chain of custody
   * @param data Case creation data
   * @returns Promise resolving to created case details
   */
  async createCase(data: CaseCreateRequest): Promise<CaseResponse> {
    try {
      // Validate request data
      await this.securityUtils.validateCaseData(data);

      // Add chain of custody metadata
      const enrichedData = await this.securityUtils.enrichWithChainOfCustody(data);

      // Prepare request with security headers
      const headers = await this.prepareSecurityHeaders('POST', API_ENDPOINTS.CASES.BASE);

      // Make API request
      const response: AxiosResponse<CaseResponse> = await apiClient.post(
        API_ENDPOINTS.CASES.BASE,
        enrichedData,
        { headers }
      );

      // Log audit event
      await this.auditLogger.logApiAccess({
        action: 'CREATE_CASE',
        entityType: 'CASE',
        entityId: response.data.id,
        changes: data
      });

      return response.data;
    } catch (error) {
      await this.handleApiError(error, 'createCase');
      throw error;
    }
  }

  /**
   * Updates an existing case with security validation and audit trail
   * @param id Case identifier
   * @param data Case update data
   * @returns Promise resolving to updated case details
   */
  async updateCase(id: string, data: CaseUpdateRequest): Promise<CaseResponse> {
    try {
      // Validate case ID and update data
      if (!this.securityUtils.validateId(id)) {
        throw new Error('Invalid case ID');
      }
      await this.securityUtils.validateCaseData(data);

      // Update chain of custody
      const enrichedData = await this.securityUtils.enrichWithChainOfCustody(data);

      // Prepare request with security headers
      const headers = await this.prepareSecurityHeaders('PUT', API_ENDPOINTS.CASES.DETAILS(id));

      // Make API request
      const response: AxiosResponse<CaseResponse> = await apiClient.put(
        API_ENDPOINTS.CASES.DETAILS(id),
        enrichedData,
        { headers }
      );

      // Log audit event
      await this.auditLogger.logApiAccess({
        action: 'UPDATE_CASE',
        entityType: 'CASE',
        entityId: id,
        changes: data
      });

      return response.data;
    } catch (error) {
      await this.handleApiError(error, 'updateCase');
      throw error;
    }
  }

  /**
   * Deletes a case by ID with security validation and final audit entry
   * @param id Case identifier
   * @returns Promise resolving to void on successful deletion
   */
  async deleteCase(id: string): Promise<void> {
    try {
      // Validate case ID
      if (!this.securityUtils.validateId(id)) {
        throw new Error('Invalid case ID');
      }

      // Create final chain of custody entry
      const headers = await this.prepareSecurityHeaders('DELETE', API_ENDPOINTS.CASES.DETAILS(id));

      // Make API request
      await apiClient.delete(API_ENDPOINTS.CASES.DETAILS(id), { headers });

      // Log audit event
      await this.auditLogger.logApiAccess({
        action: 'DELETE_CASE',
        entityType: 'CASE',
        entityId: id,
        changes: { deleted: true }
      });
    } catch (error) {
      await this.handleApiError(error, 'deleteCase');
      throw error;
    }
  }

  /**
   * Prepares security headers for API requests
   * @param method HTTP method
   * @param url API endpoint URL
   * @returns Promise resolving to headers object
   */
  private async prepareSecurityHeaders(method: string, url: string): Promise<Record<string, string>> {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    return {
      [API_HEADERS.REQUEST_ID]: requestId,
      [API_HEADERS.CLASSIFICATION_LEVEL]: 'FEDRAMP_HIGH',
      [API_HEADERS.CHAIN_OF_CUSTODY]: await this.securityUtils.generateChainHash(method, url, timestamp),
      [API_HEADERS.AUDIT_USER_ID]: localStorage.getItem('userId') || '',
      [API_HEADERS.SESSION_ID]: sessionStorage.getItem('sessionId') || ''
    };
  }

  /**
   * Handles API errors with security context
   * @param error Error object
   * @param operation Operation name for context
   */
  private async handleApiError(error: any, operation: string): Promise<void> {
    await this.auditLogger.logError({
      operation,
      error: error.message,
      timestamp: new Date(),
      severity: 'HIGH'
    });

    if (this.securityUtils.isSecurityError(error)) {
      await this.securityUtils.handleSecurityViolation(error);
    }
  }
}