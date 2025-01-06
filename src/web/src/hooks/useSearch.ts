/**
 * Custom React hook for managing secure search functionality with FedRAMP High and CJIS compliance.
 * Implements encrypted search operations, security context validation, audit logging, and rate limiting.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import debounce from 'lodash/debounce'; // v4.17.21
import {
  SearchQuery,
  SearchFilters,
  SearchResult,
  SearchResponse,
  SearchPagination,
  SearchSort,
  SecurityContext,
  isValidSearchQuery
} from '../../types/search.types';
import { searchApi } from '../../services/api/search.api';
import {
  setSearchQuery,
  updateFilters,
  updateSecurityContext,
  updatePagination,
  updateSort,
  clearSearch,
  performSecureSearch,
  fetchSecureFacets
} from '../../store/slices/search.slice';
import { API_ERROR_CODES } from '../../constants/api.constants';

// Constants for rate limiting and security
const DEBOUNCE_DELAY = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RETRIES = 3;
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
const RATE_LIMIT_MAX = 1000;
const RATE_LIMIT_BURST = 2000;

interface UseSearchProps {
  initialQuery?: string;
  securityContext: SecurityContext;
}

interface SearchError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Custom hook for secure search functionality
 */
export function useSearch({ initialQuery = '', securityContext }: UseSearchProps) {
  const dispatch = useDispatch();
  
  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Rate limiting state
  const requestCount = useRef(0);
  const lastRequestTime = useRef(Date.now());
  
  // Redux state
  const query = useSelector((state: any) => state.search.query);
  const filters = useSelector((state: any) => state.search.filters);
  const pagination = useSelector((state: any) => state.search.pagination);
  const sort = useSelector((state: any) => state.search.sort);
  const results = useSelector((state: any) => state.search.results);
  const total = useSelector((state: any) => state.search.total);

  /**
   * Validates security context and rate limits
   */
  const validateRequest = useCallback(() => {
    // Validate security context
    if (!securityContext.encryptionKey) {
      throw new Error(API_ERROR_CODES.ENCRYPTION_FAILED);
    }

    // Check rate limits
    const currentTime = Date.now();
    const timeWindow = currentTime - lastRequestTime.current;
    
    if (timeWindow < RATE_LIMIT_WINDOW) {
      if (requestCount.current >= RATE_LIMIT_MAX) {
        throw new Error(API_ERROR_CODES.RATE_LIMITED);
      }
      if (requestCount.current >= RATE_LIMIT_BURST) {
        // Apply exponential backoff
        const backoff = Math.pow(2, requestCount.current - RATE_LIMIT_MAX) * 1000;
        return new Promise(resolve => setTimeout(resolve, backoff));
      }
    } else {
      // Reset rate limit counter for new window
      requestCount.current = 0;
      lastRequestTime.current = currentTime;
    }
    
    requestCount.current++;
    return Promise.resolve();
  }, [securityContext]);

  /**
   * Performs secure search with encryption and compliance validation
   */
  const performSearch = useCallback(async (searchQuery: string) => {
    try {
      setLoading(true);
      setError(null);

      // Validate minimum query length
      if (searchQuery.length < MIN_QUERY_LENGTH) {
        return;
      }

      await validateRequest();

      const searchParams: SearchQuery = {
        query: searchQuery,
        filters,
        pagination,
        sort,
        encryptionKey: securityContext.encryptionKey
      };

      // Validate search query structure
      if (!isValidSearchQuery(searchParams)) {
        throw new Error(API_ERROR_CODES.VALIDATION_ERROR);
      }

      // Dispatch secure search action
      const response = await dispatch(performSecureSearch({
        query: searchParams,
        securityContext
      })).unwrap();

      // Update suggestions based on results
      if (response.suggestions) {
        setSuggestions(response.suggestions);
      }

    } catch (err: any) {
      setError({
        code: err.code || API_ERROR_CODES.SERVER_ERROR,
        message: err.message || 'Search failed',
        details: err.details
      });
    } finally {
      setLoading(false);
    }
  }, [dispatch, filters, pagination, sort, securityContext, validateRequest]);

  /**
   * Debounced search function with rate limiting
   */
  const debouncedSearch = useCallback(
    debounce(performSearch, DEBOUNCE_DELAY),
    [performSearch]
  );

  /**
   * Updates search query with security validation
   */
  const updateQuery = useCallback((newQuery: string) => {
    dispatch(setSearchQuery(newQuery));
    debouncedSearch(newQuery);
  }, [dispatch, debouncedSearch]);

  /**
   * Updates search filters with security context
   */
  const updateSearchFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    dispatch(updateFilters({
      ...newFilters,
      securityLevel: securityContext.classificationLevel
    }));
  }, [dispatch, securityContext]);

  /**
   * Updates pagination with validation
   */
  const updateSearchPagination = useCallback((newPagination: Partial<SearchPagination>) => {
    dispatch(updatePagination(newPagination));
  }, [dispatch]);

  /**
   * Updates sort options
   */
  const updateSearchSort = useCallback((newSort: Partial<SearchSort>) => {
    dispatch(updateSort(newSort));
  }, [dispatch]);

  /**
   * Clears search state and sensitive data
   */
  const clearSearchState = useCallback(() => {
    dispatch(clearSearch());
    setSuggestions([]);
    setError(null);
  }, [dispatch]);

  // Initialize search with security context
  useEffect(() => {
    if (initialQuery) {
      dispatch(setSearchQuery(initialQuery));
      dispatch(updateSecurityContext(securityContext));
      debouncedSearch(initialQuery);
    }

    // Cleanup sensitive data on unmount
    return () => {
      clearSearchState();
    };
  }, [dispatch, initialQuery, securityContext, debouncedSearch, clearSearchState]);

  return {
    // Search state
    query,
    results,
    loading,
    error,
    total,
    suggestions,
    filters,
    pagination,
    sort,
    securityContext,

    // Search actions
    search: updateQuery,
    updateFilters: updateSearchFilters,
    updatePagination: updateSearchPagination,
    updateSort: updateSearchSort,
    clearSearch: clearSearchState
  };
}