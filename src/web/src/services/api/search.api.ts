/**
 * Secure search API client service implementing FedRAMP and CJIS compliant search functionality
 * with encrypted query handling, comprehensive audit logging, and compliance validation.
 * @version 1.0.0
 */

import CryptoJS from 'crypto-js'; // v4.1.1
import { 
  SearchQuery, 
  SearchResponse, 
  SearchFilters,
  SearchPagination,
  SearchSort,
  SearchResult,
  SearchAudit,
  SearchEncryption,
  isValidSearchQuery
} from '../../types/search.types';
import { apiClient } from '../../config/api.config';
import { 
  API_ENDPOINTS,
  API_HEADERS,
  API_ERROR_CODES,
  COMPLIANCE_LEVELS
} from '../../constants/api.constants';

// Environment variables for security configuration
const ENCRYPTION_KEY = process.env.SEARCH_ENCRYPTION_KEY;
const COMPLIANCE_LEVEL = process.env.COMPLIANCE_LEVEL || COMPLIANCE_LEVELS.FEDRAMP_HIGH;

/**
 * Decorator for audit logging of search operations
 */
function auditLog() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const auditEntry: SearchAudit = {
        timestamp: new Date(),
        action: propertyKey,
        userId: localStorage.getItem('userId') || '',
        queryParams: args[0],
        sessionId: sessionStorage.getItem('sessionId') || ''
      };

      try {
        const result = await originalMethod.apply(this, args);
        auditEntry.success = true;
        auditEntry.resultCount = result.data?.total || 0;
        return result;
      } catch (error) {
        auditEntry.success = false;
        auditEntry.error = error;
        throw error;
      } finally {
        await logSearchAudit(auditEntry);
      }
    };
    return descriptor;
  };
}

/**
 * Secure search API client service
 */
export const searchApi = {
  /**
   * Performs an encrypted search query with compliance validation
   * @param query - Search query parameters
   * @param encryptionConfig - Encryption configuration
   * @returns Promise resolving to decrypted search results
   */
  @auditLog()
  async search(
    query: SearchQuery,
    encryptionConfig: SearchEncryption
  ): Promise<SearchResponse> {
    // Validate query structure
    if (!isValidSearchQuery(query)) {
      throw new Error(API_ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate compliance requirements
    await this.validateCompliance(query, {
      level: COMPLIANCE_LEVEL,
      requirements: ['FEDRAMP_HIGH', 'CJIS']
    });

    // Encrypt sensitive query fields
    const encryptedQuery = encryptSearchQuery(query, encryptionConfig);

    // Build secure search request
    const searchRequest = {
      query: encryptedQuery,
      filters: query.filters,
      pagination: query.pagination,
      sort: query.sort,
      metadata: {
        classificationLevel: query.filters.securityLevel,
        accessControl: query.filters.accessControl
      }
    };

    // Execute search with security headers
    const response = await apiClient.post<SearchResponse>(
      API_ENDPOINTS.SEARCH.QUERY,
      searchRequest,
      {
        headers: {
          [API_HEADERS.CLASSIFICATION_LEVEL]: query.filters.securityLevel,
          [API_HEADERS.COMPLIANCE_LEVEL]: COMPLIANCE_LEVEL
        }
      }
    );

    // Decrypt and validate response
    return decryptSearchResponse(response.data, encryptionConfig);
  },

  /**
   * Retrieves encrypted facets for search refinement
   * @param filters - Current search filters
   * @param encryptionConfig - Encryption configuration
   * @returns Promise resolving to decrypted facets
   */
  @auditLog()
  async getFacets(
    filters: SearchFilters,
    encryptionConfig: SearchEncryption
  ): Promise<Record<string, Array<{value: string, count: number}>>> {
    // Encrypt filter parameters
    const encryptedFilters = encryptSearchFilters(filters, encryptionConfig);

    // Execute facet request with security headers
    const response = await apiClient.get(
      API_ENDPOINTS.SEARCH.ADVANCED,
      {
        params: { filters: encryptedFilters },
        headers: {
          [API_HEADERS.CLASSIFICATION_LEVEL]: filters.securityLevel,
          [API_HEADERS.COMPLIANCE_LEVEL]: COMPLIANCE_LEVEL
        }
      }
    );

    // Decrypt and return facets
    return decryptFacets(response.data, encryptionConfig);
  },

  /**
   * Retrieves encrypted search suggestions
   * @param query - Search query string
   * @param encryptionConfig - Encryption configuration
   * @returns Promise resolving to decrypted suggestions
   */
  @auditLog()
  async getSuggestions(
    query: string,
    encryptionConfig: SearchEncryption
  ): Promise<Array<string>> {
    // Encrypt query string
    const encryptedQuery = encryptValue(query, encryptionConfig);

    // Execute suggestion request
    const response = await apiClient.get(
      API_ENDPOINTS.SEARCH.SUGGEST,
      {
        params: { q: encryptedQuery },
        headers: {
          [API_HEADERS.COMPLIANCE_LEVEL]: COMPLIANCE_LEVEL
        }
      }
    );

    // Decrypt and return suggestions
    return decryptSuggestions(response.data, encryptionConfig);
  },

  /**
   * Validates search operations against compliance requirements
   * @param query - Search query to validate
   * @param config - Compliance configuration
   * @returns Promise resolving to validation result
   */
  @auditLog()
  async validateCompliance(
    query: SearchQuery,
    config: { level: string; requirements: string[] }
  ): Promise<boolean> {
    const response = await apiClient.post(
      API_ENDPOINTS.COMPLIANCE.CHECK,
      {
        query,
        level: config.level,
        requirements: config.requirements
      }
    );
    return response.data.valid;
  }
};

/**
 * Helper function to encrypt search query
 */
function encryptSearchQuery(
  query: SearchQuery,
  config: SearchEncryption
): string {
  return CryptoJS.AES.encrypt(
    JSON.stringify(query),
    config.key
  ).toString();
}

/**
 * Helper function to encrypt search filters
 */
function encryptSearchFilters(
  filters: SearchFilters,
  config: SearchEncryption
): string {
  return CryptoJS.AES.encrypt(
    JSON.stringify(filters),
    config.key
  ).toString();
}

/**
 * Helper function to encrypt individual values
 */
function encryptValue(
  value: string,
  config: SearchEncryption
): string {
  return CryptoJS.AES.encrypt(value, config.key).toString();
}

/**
 * Helper function to decrypt search response
 */
function decryptSearchResponse(
  response: SearchResponse,
  config: SearchEncryption
): SearchResponse {
  const bytes = CryptoJS.AES.decrypt(response.data, config.key);
  const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  return {
    ...response,
    data: decrypted
  };
}

/**
 * Helper function to decrypt facets
 */
function decryptFacets(
  facets: string,
  config: SearchEncryption
): Record<string, Array<{value: string, count: number}>> {
  const bytes = CryptoJS.AES.decrypt(facets, config.key);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

/**
 * Helper function to decrypt suggestions
 */
function decryptSuggestions(
  suggestions: string,
  config: SearchEncryption
): Array<string> {
  const bytes = CryptoJS.AES.decrypt(suggestions, config.key);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

/**
 * Helper function to log search audit events
 */
async function logSearchAudit(auditEntry: SearchAudit): Promise<void> {
  await apiClient.post(
    API_ENDPOINTS.AUDIT.LOGS,
    auditEntry,
    {
      headers: {
        [API_HEADERS.COMPLIANCE_LEVEL]: COMPLIANCE_LEVEL
      }
    }
  );
}