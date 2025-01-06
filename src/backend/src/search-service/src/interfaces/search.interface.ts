/**
 * @file Search service interface definitions for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant search interfaces
 * with support for encrypted search, security classifications, and audit tracking
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';
import { SearchRequestBody, EncryptedSearchParams } from '@elastic/elasticsearch'; // v8.9.0
import { EncryptedSearchParams as SecurityParams } from '@elastic/elasticsearch-security'; // v8.9.0

/**
 * Valid sort orders for search results
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Supported media types for evidence search
 */
export type MediaType = 'audio' | 'video' | 'image' | 'text';

/**
 * Security classification levels per CJIS requirements
 */
export type SecurityLevel = 'unclassified' | 'sensitive' | 'confidential' | 'restricted';

/**
 * Supported encryption algorithms for secure search
 */
export type EncryptionAlgorithm = 'AES256' | 'AES512';

/**
 * Interface for date range filters
 */
export interface IDateRange {
  startDate?: Date;
  endDate?: Date;
}

/**
 * Interface for search pagination parameters
 */
export interface ISearchPagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Interface for search result sorting
 */
export interface ISearchSort {
  field: string;
  order: SortOrder;
}

/**
 * Interface for encrypted search parameters
 */
export interface IEncryptionParams {
  keyId: string;
  algorithm: EncryptionAlgorithm;
  fields: string[];
  securityParams?: SecurityParams;
}

/**
 * Interface for search filter parameters with security classifications
 */
export interface ISearchFilters {
  dateRange?: IDateRange;
  mediaTypes?: MediaType[];
  caseIds?: string[];
  entityTypes?: string[];
  securityLevel?: SecurityLevel;
  jurisdiction?: string[];
  classification?: {
    minClearanceLevel: SecurityLevel;
    compartments?: string[];
    handlingCaveats?: string[];
  };
}

/**
 * Interface for search facet results
 */
export interface ISearchFacets {
  mediaTypes: Array<{ key: MediaType; count: number }>;
  securityLevels: Array<{ key: SecurityLevel; count: number }>;
  entityTypes: Array<{ key: string; count: number }>;
  dateHistogram: Array<{ key: string; count: number }>;
}

/**
 * Interface for search audit information
 */
export interface ISearchAudit {
  timestamp: Date;
  userId: string;
  queryHash: string;
  accessLevel: SecurityLevel;
  encryptionUsed: boolean;
  clientInfo: {
    ipAddress: string;
    userAgent: string;
    geoLocation?: {
      latitude: number;
      longitude: number;
    };
  };
}

/**
 * Interface for individual search result
 */
export interface ISearchResult extends IBaseEntity {
  title: string;
  description?: string;
  mediaType: MediaType;
  securityLevel: SecurityLevel;
  caseId: string;
  evidenceId: string;
  matchScore: number;
  highlights?: {
    field: string;
    fragments: string[];
  }[];
  classification: {
    level: SecurityLevel;
    caveats: string[];
    handlingInstructions: string[];
  };
}

/**
 * Interface for search query parameters with encryption support
 */
export interface ISearchQuery {
  query: string;
  filters?: ISearchFilters;
  pagination?: ISearchPagination;
  sort?: ISearchSort;
  encryptionParams?: IEncryptionParams;
  searchRequestBody?: SearchRequestBody;
  auditContext?: {
    userId: string;
    sessionId: string;
    purpose: string;
  };
}

/**
 * Interface for search response with audit information
 */
export interface ISearchResponse {
  total: number;
  results: ISearchResult[];
  facets: ISearchFacets;
  auditInfo: ISearchAudit;
  meta: {
    took: number;
    timedOut: boolean;
    shards: {
      total: number;
      successful: number;
      failed: number;
    };
  };
}

/**
 * Interface for natural language query processing
 */
export interface INaturalLanguageQuery {
  rawQuery: string;
  analyzedIntent?: string;
  extractedEntities?: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  suggestedFilters?: ISearchFilters;
}

/**
 * Interface for search suggestions
 */
export interface ISearchSuggestions {
  text: string;
  highlighted: string;
  score: number;
  type: 'recent' | 'popular' | 'suggested';
  metadata?: Record<string, unknown>;
}