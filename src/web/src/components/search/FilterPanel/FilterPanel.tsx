/**
 * FilterPanel Component
 * Implements secure and accessible advanced search filtering for CrimeMiner
 * with FedRAMP High and CJIS compliance.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // v18.2.0
import { DatePicker } from '@mui/x-date-pickers'; // v6.0.0
import debounce from 'lodash/debounce'; // v4.17.21
import { SearchFilters } from '../../../types/search.types';
import { useSearch } from '../../../hooks/useSearch';

// Constants for filter options and accessibility
const MEDIA_TYPE_OPTIONS = ['audio', 'video', 'image', 'text'] as const;
const ENTITY_TYPE_OPTIONS = ['person', 'location', 'organization', 'date', 'event'] as const;

const ARIA_LABELS = {
  dateRange: 'Date range filter for evidence search',
  mediaType: 'Media type filter for evidence search',
  entityType: 'Entity type filter for evidence search',
  clearFilters: 'Clear all search filters'
};

// Interface for component props
interface FilterPanelProps {
  initialFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  className?: string;
  securityContext: {
    classificationLevel: string;
    encryptionKey: string | null;
  };
  highContrastMode?: boolean;
  ariaLabel?: string;
  ariaDescription?: string;
}

/**
 * FilterPanel component for secure and accessible search refinement
 */
export const FilterPanel: React.FC<FilterPanelProps> = ({
  initialFilters,
  onFilterChange,
  className = '',
  securityContext,
  highContrastMode = false,
  ariaLabel = 'Search filter panel',
  ariaDescription = 'Panel for refining search results with various filters'
}) => {
  // Local state for filter values
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const { encryptFilter } = useSearch({ securityContext });

  // Styles for high contrast mode
  const highContrastStyles = useMemo(() => ({
    backgroundColor: highContrastMode ? '#000000' : '#ffffff',
    color: highContrastMode ? '#ffffff' : '#000000',
    border: highContrastMode ? '2px solid #ffffff' : '1px solid #cccccc'
  }), [highContrastMode]);

  /**
   * Securely handles date range changes with encryption
   */
  const handleDateRangeChange = useCallback(
    debounce(async (startDate: string, endDate: string) => {
      try {
        // Encrypt date range values
        const encryptedStartDate = await encryptFilter(startDate);
        const encryptedEndDate = await encryptFilter(endDate);

        const updatedFilters = {
          ...filters,
          dateRange: {
            startDate: encryptedStartDate,
            endDate: encryptedEndDate
          }
        };

        setFilters(updatedFilters);
        onFilterChange(updatedFilters);

        // Announce change to screen readers
        const announcement = `Date range updated to ${startDate} through ${endDate}`;
        announceChange(announcement);
      } catch (error) {
        console.error('Failed to update date range:', error);
        announceChange('Error updating date range');
      }
    }, 300),
    [filters, encryptFilter, onFilterChange]
  );

  /**
   * Securely handles media type selection changes
   */
  const handleMediaTypeChange = useCallback(
    debounce(async (selectedTypes: string[]) => {
      try {
        // Validate and sanitize media types
        const validTypes = selectedTypes.filter(type => 
          MEDIA_TYPE_OPTIONS.includes(type as any)
        );

        // Encrypt selected types
        const encryptedTypes = await Promise.all(
          validTypes.map(type => encryptFilter(type))
        );

        const updatedFilters = {
          ...filters,
          mediaTypes: encryptedTypes
        };

        setFilters(updatedFilters);
        onFilterChange(updatedFilters);

        // Announce change to screen readers
        const announcement = `Selected media types: ${validTypes.join(', ')}`;
        announceChange(announcement);
      } catch (error) {
        console.error('Failed to update media types:', error);
        announceChange('Error updating media types');
      }
    }, 300),
    [filters, encryptFilter, onFilterChange]
  );

  /**
   * Securely handles entity type selection changes
   */
  const handleEntityTypeChange = useCallback(
    debounce(async (selectedTypes: string[]) => {
      try {
        // Validate and sanitize entity types
        const validTypes = selectedTypes.filter(type =>
          ENTITY_TYPE_OPTIONS.includes(type as any)
        );

        // Encrypt selected types
        const encryptedTypes = await Promise.all(
          validTypes.map(type => encryptFilter(type))
        );

        const updatedFilters = {
          ...filters,
          entityTypes: encryptedTypes
        };

        setFilters(updatedFilters);
        onFilterChange(updatedFilters);

        // Announce change to screen readers
        const announcement = `Selected entity types: ${validTypes.join(', ')}`;
        announceChange(announcement);
      } catch (error) {
        console.error('Failed to update entity types:', error);
        announceChange('Error updating entity types');
      }
    }, 300),
    [filters, encryptFilter, onFilterChange]
  );

  /**
   * Handles clearing all filters
   */
  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    onFilterChange(initialFilters);
    announceChange('All filters cleared');
  }, [initialFilters, onFilterChange]);

  /**
   * Announces changes to screen readers
   */
  const announceChange = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  // Update filters when initial filters change
  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return (
    <div 
      className={`filter-panel ${className}`}
      role="region"
      aria-label={ariaLabel}
      aria-description={ariaDescription}
      style={highContrastStyles}
    >
      {/* Date Range Filter */}
      <div role="group" aria-labelledby="date-range-label">
        <h3 id="date-range-label">{ARIA_LABELS.dateRange}</h3>
        <DatePicker
          label="Start Date"
          value={filters.dateRange.startDate}
          onChange={(date) => handleDateRangeChange(
            date?.toISOString() || '',
            filters.dateRange.endDate
          )}
          aria-label="Start date filter"
        />
        <DatePicker
          label="End Date"
          value={filters.dateRange.endDate}
          onChange={(date) => handleDateRangeChange(
            filters.dateRange.startDate,
            date?.toISOString() || ''
          )}
          aria-label="End date filter"
        />
      </div>

      {/* Media Type Filter */}
      <div role="group" aria-labelledby="media-type-label">
        <h3 id="media-type-label">{ARIA_LABELS.mediaType}</h3>
        {MEDIA_TYPE_OPTIONS.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={filters.mediaTypes.includes(type)}
              onChange={(e) => {
                const updatedTypes = e.target.checked
                  ? [...filters.mediaTypes, type]
                  : filters.mediaTypes.filter(t => t !== type);
                handleMediaTypeChange(updatedTypes);
              }}
              aria-label={`Filter by ${type}`}
            />
            {type}
          </label>
        ))}
      </div>

      {/* Entity Type Filter */}
      <div role="group" aria-labelledby="entity-type-label">
        <h3 id="entity-type-label">{ARIA_LABELS.entityType}</h3>
        {ENTITY_TYPE_OPTIONS.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={filters.entityTypes.includes(type)}
              onChange={(e) => {
                const updatedTypes = e.target.checked
                  ? [...filters.entityTypes, type]
                  : filters.entityTypes.filter(t => t !== type);
                handleEntityTypeChange(updatedTypes);
              }}
              aria-label={`Filter by ${type}`}
            />
            {type}
          </label>
        ))}
      </div>

      {/* Clear Filters Button */}
      <button
        onClick={handleClearFilters}
        aria-label={ARIA_LABELS.clearFilters}
        className="clear-filters-btn"
      >
        Clear Filters
      </button>
    </div>
  );
};

export default FilterPanel;