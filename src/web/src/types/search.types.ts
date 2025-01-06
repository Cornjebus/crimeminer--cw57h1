// @ts-check
import { z } from 'zod'; // v3.22.0

// Global type definitions
export type SortOrder = 'asc' | 'desc';

export type MediaType = 'audio' | 'video' | 'image' | 'text';

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type SecurityLevel = 'top_secret' | 'secret' | 'confidential' | 'unclassified';

export type SecurityClassification = {
  level: SecurityLevel;
  compartments: string[];
  caveats: string[];
};

export type AccessControlFilter = {
  departments: string[];
  clearanceLevel: SecurityLevel;
  roles: string[];
};

export type AuditLogEntry = {
  timestamp: string;
  action: string;
  userId: string;
  details: Record<string, unknown>;
};

// Search pagination type
export interface SearchPagination {
  page: number;
  limit: number;
}

// Search sort type
export interface SearchSort {
  field: string;
  order: SortOrder;
}

// Search filters interface with security controls
export interface SearchFilters {
  dateRange: DateRange;
  mediaTypes: MediaType[];
  caseIds: string[];
  entityTypes: string[];
  securityLevel: SecurityLevel;
  accessControl: AccessControlFilter;
}

// Main search query interface with encryption support
export interface SearchQuery {
  query: string;
  filters: SearchFilters;
  pagination: SearchPagination;
  sort: SearchSort;
  encryptionKey: string | null;
}

// Enhanced metadata interface with security and audit information
export interface SearchMetadata {
  caseId: string;
  evidenceId: string;
  securityClassification: SecurityClassification;
  auditLog: AuditLogEntry[];
}

// Zod schema for runtime validation
const searchQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  filters: z.object({
    dateRange: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime()
    }),
    mediaTypes: z.array(z.enum(['audio', 'video', 'image', 'text'])),
    caseIds: z.array(z.string().uuid()),
    entityTypes: z.array(z.string()),
    securityLevel: z.enum(['top_secret', 'secret', 'confidential', 'unclassified']),
    accessControl: z.object({
      departments: z.array(z.string()),
      clearanceLevel: z.enum(['top_secret', 'secret', 'confidential', 'unclassified']),
      roles: z.array(z.string())
    })
  }),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100)
  }),
  sort: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc'])
  }),
  encryptionKey: z.string().nullable()
});

/**
 * Type guard to validate SearchQuery objects at runtime
 * @param value - Value to validate
 * @returns boolean indicating if value is a valid SearchQuery
 */
export function isValidSearchQuery(value: unknown): value is SearchQuery {
  try {
    searchQuerySchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

// Export the schema for external validation
export const SearchQuerySchema = searchQuerySchema;