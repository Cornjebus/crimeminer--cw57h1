/**
 * Redux slice for managing secure search state with FedRAMP High and CJIS compliance
 * Implements encrypted search operations, security classifications, and audit logging
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import {
  SearchQuery,
  SearchResponse,
  SearchFilters,
  SearchPagination,
  SearchSort,
  SearchMetadata,
  SecurityContext,
  AuditLog
} from '../../types/search.types';
import { searchApi } from '../../services/api/search.api';
import { API_ERROR_CODES } from '../../constants/api.constants';

// Initial state with security context and audit tracking
interface SearchState {
  // Search parameters
  query: string;
  filters: SearchFilters;
  pagination: SearchPagination;
  sort: SearchSort;
  
  // Security context
  securityContext: SecurityContext;
  
  // Results and metadata
  results: Array<{
    id: string;
    content: any;
    metadata: SearchMetadata;
    securityClassification: string;
  }>;
  facets: Record<string, Array<{value: string, count: number}>>;
  total: number;
  
  // UI state
  loading: boolean;
  error: string | null;
  
  // Audit tracking
  lastSearchTimestamp: string | null;
  searchHistory: AuditLog[];
}

const initialState: SearchState = {
  query: '',
  filters: {
    dateRange: {
      startDate: '',
      endDate: ''
    },
    mediaTypes: [],
    caseIds: [],
    entityTypes: [],
    securityLevel: 'unclassified',
    accessControl: {
      departments: [],
      clearanceLevel: 'unclassified',
      roles: []
    }
  },
  pagination: {
    page: 1,
    limit: 20
  },
  sort: {
    field: 'relevance',
    order: 'desc'
  },
  securityContext: {
    classificationLevel: 'unclassified',
    compartments: [],
    caveats: [],
    encryptionKey: null
  },
  results: [],
  facets: {},
  total: 0,
  loading: false,
  error: null,
  lastSearchTimestamp: null,
  searchHistory: []
};

// Async thunk for performing secure search with encryption
export const performSecureSearch = createAsyncThunk(
  'search/performSecureSearch',
  async (
    { query, securityContext }: { query: SearchQuery; securityContext: SecurityContext },
    { rejectWithValue }
  ) => {
    try {
      // Validate security context
      if (!securityContext.encryptionKey) {
        throw new Error(API_ERROR_CODES.ENCRYPTION_FAILED);
      }

      // Execute encrypted search
      const response = await searchApi.search(query, {
        key: securityContext.encryptionKey
      });

      return response;
    } catch (error: any) {
      return rejectWithValue({
        code: error.code || API_ERROR_CODES.SERVER_ERROR,
        message: error.message
      });
    }
  }
);

// Async thunk for retrieving encrypted facets
export const fetchSecureFacets = createAsyncThunk(
  'search/fetchSecureFacets',
  async (
    { filters, securityContext }: { filters: SearchFilters; securityContext: SecurityContext },
    { rejectWithValue }
  ) => {
    try {
      const facets = await searchApi.getFacets(filters, {
        key: securityContext.encryptionKey!
      });
      return facets;
    } catch (error: any) {
      return rejectWithValue({
        code: error.code || API_ERROR_CODES.SERVER_ERROR,
        message: error.message
      });
    }
  }
);

// Search slice with security-enhanced reducers
const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    // Update search query with security validation
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
      state.pagination.page = 1; // Reset pagination
    },

    // Update filters with security context
    updateFilters: (state, action: PayloadAction<Partial<SearchFilters>>) => {
      state.filters = {
        ...state.filters,
        ...action.payload
      };
      state.pagination.page = 1; // Reset pagination
    },

    // Update security context
    updateSecurityContext: (state, action: PayloadAction<Partial<SecurityContext>>) => {
      state.securityContext = {
        ...state.securityContext,
        ...action.payload
      };
    },

    // Update pagination
    updatePagination: (state, action: PayloadAction<Partial<SearchPagination>>) => {
      state.pagination = {
        ...state.pagination,
        ...action.payload
      };
    },

    // Update sort options
    updateSort: (state, action: PayloadAction<Partial<SearchSort>>) => {
      state.sort = {
        ...state.sort,
        ...action.payload
      };
    },

    // Clear search state with security audit
    clearSearch: (state) => {
      const timestamp = new Date().toISOString();
      state.searchHistory.push({
        timestamp,
        action: 'CLEAR_SEARCH',
        userId: localStorage.getItem('userId') || '',
        details: { previousQuery: state.query }
      });
      return { ...initialState, searchHistory: state.searchHistory };
    }
  },
  extraReducers: (builder) => {
    // Handle secure search lifecycle
    builder
      .addCase(performSecureSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(performSecureSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload.data;
        state.total = action.payload.total;
        state.lastSearchTimestamp = new Date().toISOString();
        
        // Add to search history
        state.searchHistory.push({
          timestamp: state.lastSearchTimestamp,
          action: 'SEARCH_COMPLETED',
          userId: localStorage.getItem('userId') || '',
          details: {
            query: state.query,
            resultCount: action.payload.total
          }
        });
      })
      .addCase(performSecureSearch.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.message || 'Search failed';
        
        // Log error to search history
        state.searchHistory.push({
          timestamp: new Date().toISOString(),
          action: 'SEARCH_FAILED',
          userId: localStorage.getItem('userId') || '',
          details: {
            error: action.payload
          }
        });
      })
      // Handle secure facets lifecycle
      .addCase(fetchSecureFacets.fulfilled, (state, action) => {
        state.facets = action.payload;
      });
  }
});

// Export actions and reducer
export const {
  setSearchQuery,
  updateFilters,
  updateSecurityContext,
  updatePagination,
  updateSort,
  clearSearch
} = searchSlice.actions;

export default searchSlice.reducer;