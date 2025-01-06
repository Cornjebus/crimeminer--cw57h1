/**
 * A secure search bar component implementing FedRAMP High and CJIS compliant search functionality
 * with encrypted natural language query input, auto-completion, and real-time search capabilities.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useContext } from 'react'; // v18.2.0
import debounce from 'lodash/debounce'; // v4.17.21
import CryptoJS from 'crypto-js'; // v4.1.1
import { Input } from '../../common/Input/Input';
import { useSearch } from '../../../hooks/useSearch';
import { THEME, TYPOGRAPHY } from '../../../constants/ui.constants';
import { API_ERROR_CODES } from '../../../constants/api.constants';

// Rate limiting constants
const DEBOUNCE_DELAY = 300;
const MIN_QUERY_LENGTH = 2;
const RATE_LIMIT = {
  MAX_REQUESTS: 1000,
  BURST_LIMIT: 2000,
  WINDOW: 3600000 // 1 hour in milliseconds
};

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  onSearch?: (query: string, results: any[]) => void;
  initialFilters?: SearchFilters;
  securityContext: SecurityContext;
}

interface RateLimitState {
  count: number;
  lastRequest: number;
}

/**
 * Secure search bar component with FedRAMP and CJIS compliance
 */
const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = 'Enter search query...',
  className,
  onSearch,
  initialFilters,
  securityContext
}) => {
  // Local state
  const [localQuery, setLocalQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitState>({
    count: 0,
    lastRequest: Date.now()
  });

  // Custom search hook
  const {
    search,
    results,
    loading,
    error: searchError,
    suggestions,
    updateFilters
  } = useSearch({
    initialQuery: '',
    securityContext
  });

  /**
   * Encrypts search query using field-level encryption
   */
  const encryptQuery = useCallback((query: string): string => {
    if (!securityContext.encryptionKey) {
      throw new Error(API_ERROR_CODES.ENCRYPTION_FAILED);
    }
    return CryptoJS.AES.encrypt(query, securityContext.encryptionKey).toString();
  }, [securityContext]);

  /**
   * Validates rate limits and updates counter
   */
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    const timeWindow = now - rateLimit.lastRequest;

    if (timeWindow >= RATE_LIMIT.WINDOW) {
      // Reset counter for new window
      setRateLimit({ count: 1, lastRequest: now });
      return true;
    }

    if (rateLimit.count >= RATE_LIMIT.MAX_REQUESTS) {
      setError('Rate limit exceeded. Please try again later.');
      return false;
    }

    if (rateLimit.count >= RATE_LIMIT.BURST_LIMIT) {
      setError('Burst limit exceeded. Please slow down your requests.');
      return false;
    }

    setRateLimit(prev => ({
      count: prev.count + 1,
      lastRequest: prev.lastRequest
    }));
    return true;
  }, [rateLimit]);

  /**
   * Handles secure search input changes with debouncing
   */
  const handleInputChange = useCallback(
    debounce(async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const query = event.target.value.trim();
        setLocalQuery(query);
        setError(null);

        // Validate minimum query length
        if (query.length < MIN_QUERY_LENGTH) {
          return;
        }

        // Check rate limits
        if (!checkRateLimit()) {
          return;
        }

        // Encrypt query
        const encryptedQuery = encryptQuery(query);

        // Perform secure search
        await search(encryptedQuery);

        // Notify parent component
        if (onSearch) {
          onSearch(query, results);
        }

        // Log search attempt for audit
        console.info('Search performed:', {
          timestamp: new Date().toISOString(),
          queryLength: query.length,
          hasResults: results.length > 0
        });

      } catch (err: any) {
        setError(err.message || 'Search failed');
        console.error('Search error:', {
          timestamp: new Date().toISOString(),
          error: err.message,
          code: err.code
        });
      }
    }, DEBOUNCE_DELAY),
    [search, results, onSearch, checkRateLimit, encryptQuery]
  );

  /**
   * Handles secure keyboard interactions
   */
  const handleKeyPress = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      
      try {
        // Validate security context
        if (!securityContext.encryptionKey) {
          throw new Error(API_ERROR_CODES.ENCRYPTION_FAILED);
        }

        // Check rate limits
        if (!checkRateLimit()) {
          return;
        }

        // Encrypt and perform immediate search
        const encryptedQuery = encryptQuery(localQuery);
        search(encryptedQuery);

        // Log keyboard interaction
        console.info('Enter key search:', {
          timestamp: new Date().toISOString(),
          queryLength: localQuery.length
        });

      } catch (err: any) {
        setError(err.message || 'Search failed');
      }
    }
  }, [localQuery, search, checkRateLimit, encryptQuery, securityContext]);

  // Initialize filters
  useEffect(() => {
    if (initialFilters) {
      updateFilters(initialFilters);
    }
  }, [initialFilters, updateFilters]);

  // Styles
  const searchBarStyles = {
    container: {
      position: 'relative' as const,
      width: '100%',
      maxWidth: '800px'
    },
    input: {
      width: '100%',
      height: '48px',
      fontSize: TYPOGRAPHY.FONT_SIZE.MD,
      backgroundColor: THEME.LIGHT.BACKGROUND,
      border: `1px solid ${error ? THEME.LIGHT.ERROR : THEME.LIGHT.BORDER}`,
      borderRadius: '4px',
      padding: '8px 16px'
    },
    error: {
      color: THEME.LIGHT.ERROR,
      fontSize: TYPOGRAPHY.FONT_SIZE.SM,
      marginTop: '4px'
    },
    loading: {
      position: 'absolute' as const,
      right: '16px',
      top: '50%',
      transform: 'translateY(-50%)'
    }
  };

  return (
    <div style={searchBarStyles.container} className={className}>
      <Input
        id="secure-search"
        name="secure-search"
        type="search"
        value={localQuery}
        placeholder={placeholder}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        error={error || searchError}
        disabled={loading}
        required
        allowPaste={false}
        ariaProps={{
          'aria-label': 'Search input',
          'aria-describedby': error ? 'search-error' : undefined,
          'aria-busy': loading ? 'true' : 'false'
        }}
      />
      {loading && (
        <div style={searchBarStyles.loading} aria-hidden="true">
          Loading...
        </div>
      )}
      {(error || searchError) && (
        <div 
          id="search-error"
          role="alert"
          style={searchBarStyles.error}
        >
          {error || searchError}
        </div>
      )}
    </div>
  );
};

export default SearchBar;