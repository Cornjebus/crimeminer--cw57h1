/**
 * Main search page component for the CrimeMiner investigative platform.
 * Implements FedRAMP High and CJIS compliant search with enhanced security and accessibility.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useVirtualizer } from '@tanstack/react-virtual';
import { auditLog } from '@crimeminer/audit-logging';
import SearchBar from '../../components/search/SearchBar/SearchBar';
import FilterPanel from '../../components/search/FilterPanel/FilterPanel';
import { useSearch } from '../../hooks/useSearch';
import { THEME, TYPOGRAPHY, LAYOUT } from '../../constants/ui.constants';

// Rate limiting constants
const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  WINDOW: 60000, // 1 minute
};

interface SearchPageProps {
  className?: string;
  initialQuery?: string;
  accessLevel: SecurityAccessLevel;
}

/**
 * Main search page component with enhanced security and accessibility
 */
const Search: React.FC<SearchPageProps> = ({
  className = '',
  initialQuery = '',
  accessLevel
}) => {
  // Local state
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [lastRequest, setLastRequest] = useState(Date.now());
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Redux state and dispatch
  const dispatch = useDispatch();
  const {
    query,
    filters,
    results,
    loading,
    error,
    total,
    securityContext
  } = useSelector((state: any) => state.search);

  // Custom hooks
  const { search, updateFilters, clearSearch } = useSearch({
    initialQuery,
    securityContext: {
      classificationLevel: accessLevel,
      encryptionKey: process.env.VITE_SEARCH_ENCRYPTION_KEY
    }
  });

  // Virtual scrolling for performance
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => resultsContainerRef.current,
    estimateSize: () => 100,
    overscan: 5
  });

  /**
   * Handles secure search execution with rate limiting and audit logging
   */
  const handleSearch = useCallback(async (searchQuery: string) => {
    try {
      // Check rate limits
      const now = Date.now();
      if (now - lastRequest < RATE_LIMIT.WINDOW) {
        if (requestCount >= RATE_LIMIT.MAX_REQUESTS) {
          throw new Error('Rate limit exceeded');
        }
        setRequestCount(prev => prev + 1);
      } else {
        setRequestCount(1);
        setLastRequest(now);
      }

      // Execute secure search
      await search(searchQuery);

      // Log search attempt
      auditLog('search_execution', {
        query: searchQuery,
        filters,
        timestamp: new Date().toISOString(),
        userId: localStorage.getItem('userId')
      });

      // Announce results to screen readers
      announceSearchResults();

    } catch (err: any) {
      console.error('Search error:', err);
      announceError(err.message);
    }
  }, [search, filters, requestCount, lastRequest]);

  /**
   * Handles filter changes with security validation
   */
  const handleFilterChange = useCallback((newFilters: SearchFilters) => {
    try {
      // Validate security context
      if (newFilters.securityLevel > accessLevel) {
        throw new Error('Insufficient security clearance');
      }

      // Update filters
      updateFilters(newFilters);

      // Log filter change
      auditLog('filter_change', {
        filters: newFilters,
        timestamp: new Date().toISOString(),
        userId: localStorage.getItem('userId')
      });

      // Announce filter changes
      announceFilterChange(newFilters);

    } catch (err: any) {
      console.error('Filter error:', err);
      announceError(err.message);
    }
  }, [updateFilters, accessLevel]);

  /**
   * Announces search results to screen readers
   */
  const announceSearchResults = () => {
    const message = loading
      ? 'Searching...'
      : `Found ${total} results for your search`;
    
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  /**
   * Announces filter changes to screen readers
   */
  const announceFilterChange = (newFilters: SearchFilters) => {
    const message = `Filters updated: ${Object.keys(newFilters).join(', ')}`;
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  /**
   * Announces errors to screen readers
   */
  const announceError = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSearch();
    };
  }, [clearSearch]);

  // Styles
  const styles = {
    container: {
      padding: LAYOUT.SPACING.MD,
      maxWidth: LAYOUT.GRID.MAX_WIDTH,
      margin: '0 auto'
    },
    header: {
      marginBottom: LAYOUT.SPACING.LG
    },
    searchArea: {
      display: 'flex',
      gap: LAYOUT.SPACING.MD,
      marginBottom: LAYOUT.SPACING.XL
    },
    resultsContainer: {
      height: '600px',
      overflow: 'auto',
      border: `1px solid ${THEME.LIGHT.BORDER}`,
      borderRadius: '4px',
      backgroundColor: highContrastMode ? '#000' : THEME.LIGHT.BACKGROUND
    },
    resultItem: {
      padding: LAYOUT.SPACING.MD,
      borderBottom: `1px solid ${THEME.LIGHT.BORDER}`,
      backgroundColor: highContrastMode ? '#000' : THEME.LIGHT.BACKGROUND,
      color: highContrastMode ? '#fff' : THEME.LIGHT.TEXT
    },
    error: {
      color: THEME.LIGHT.ERROR,
      padding: LAYOUT.SPACING.MD,
      marginBottom: LAYOUT.SPACING.MD
    }
  };

  return (
    <div 
      className={`search-page ${className}`}
      style={styles.container}
      role="main"
      aria-label="Search page"
    >
      <header style={styles.header}>
        <h1>Evidence Search</h1>
        <button
          onClick={() => setHighContrastMode(!highContrastMode)}
          aria-pressed={highContrastMode}
        >
          Toggle High Contrast
        </button>
      </header>

      <div style={styles.searchArea}>
        <SearchBar
          placeholder="Search evidence..."
          onSearch={handleSearch}
          initialFilters={filters}
          securityContext={securityContext}
        />
        <FilterPanel
          initialFilters={filters}
          onFilterChange={handleFilterChange}
          securityContext={securityContext}
          highContrastMode={highContrastMode}
        />
      </div>

      {error && (
        <div 
          role="alert"
          style={styles.error}
        >
          {error}
        </div>
      )}

      <div
        ref={resultsContainerRef}
        style={styles.resultsContainer}
        role="region"
        aria-label="Search results"
        aria-busy={loading}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => (
            <div
              key={virtualRow.index}
              style={{
                ...styles.resultItem,
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
              role="article"
              aria-posinset={virtualRow.index + 1}
              aria-setsize={results.length}
            >
              {results[virtualRow.index].content}
            </div>
          ))}
        </div>
      </div>

      {!loading && results.length === 0 && (
        <div 
          role="status"
          aria-live="polite"
        >
          No results found
        </div>
      )}
    </div>
  );
};

export default Search;