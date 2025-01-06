import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { axe } from '@axe-core/react';
import { FilterPanel, FilterPanelProps } from './FilterPanel';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Mock initial filters with security classification
const mockInitialFilters = {
  dateRange: {
    startDate: '',
    endDate: ''
  },
  mediaTypes: [],
  entityTypes: [],
  securityLevel: 'RESTRICTED',
  accessControl: {
    departments: [],
    clearanceLevel: 'SECRET',
    roles: []
  }
};

// Mock security context for FedRAMP/CJIS compliance
const mockSecurityContext = {
  classificationLevel: 'SECRET',
  encryptionKey: 'test-key-123',
  userId: 'test-user',
  auditEnabled: true,
  cjisCompliant: true
};

// Enhanced test setup with security and audit logging
const setupTest = (
  initialFilters = mockInitialFilters,
  securityContext = mockSecurityContext
) => {
  // Mock filter change handler with audit logging
  const onFilterChange = vi.fn(async (filters) => {
    // Simulate audit logging
    console.log('Audit: Filter change', {
      timestamp: new Date().toISOString(),
      userId: securityContext.userId,
      action: 'FILTER_UPDATE',
      details: filters
    });
  });

  // Mock audit logger
  const auditLogger = {
    log: vi.fn(),
    error: vi.fn()
  };

  // Render with security providers
  const utils = renderWithProviders(
    <FilterPanel
      initialFilters={initialFilters}
      onFilterChange={onFilterChange}
      securityContext={securityContext}
      ariaLabel="Search filters"
      highContrastMode={false}
    />,
    {
      preloadedState: {
        search: {
          filters: initialFilters
        }
      }
    }
  );

  return {
    ...utils,
    onFilterChange,
    auditLogger
  };
};

describe('FilterPanel Component', () => {
  beforeEach(() => {
    // Reset mocks and storage before each test
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders all filter controls with proper security context', async () => {
    const { container } = setupTest();

    // Verify all filter sections are present
    expect(screen.getByLabelText(/date range filter/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/media type filter/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entity type filter/i)).toBeInTheDocument();

    // Verify security classification indicator
    expect(screen.getByText(/RESTRICTED/i)).toBeInTheDocument();

    // Verify ARIA compliance
    expect(container.querySelector('[role="region"]')).toHaveAttribute(
      'aria-label',
      'Search filters'
    );

    // Run accessibility audit
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('handles date range changes with audit logging', async () => {
    const { onFilterChange } = setupTest();

    // Change start date
    const startDateInput = screen.getByLabelText(/start date/i);
    await userEvent.type(startDateInput, '2024-01-15');
    fireEvent.blur(startDateInput);

    // Verify filter change and audit logging
    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({
            startDate: expect.any(String)
          })
        })
      );
    });

    // Verify security classification maintained
    expect(screen.getByText(/RESTRICTED/i)).toBeInTheDocument();
  });

  it('enforces security-based media type filtering', async () => {
    const { onFilterChange } = setupTest({
      ...mockInitialFilters,
      securityLevel: 'TOP_SECRET'
    });

    // Attempt to select restricted media type
    const videoCheckbox = screen.getByLabelText(/filter by video/i);
    await userEvent.click(videoCheckbox);

    // Verify security policy enforcement
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'TOP_SECRET'
      })
    );

    // Verify audit logging of attempt
    expect(console.log).toHaveBeenCalledWith(
      'Audit: Filter change',
      expect.objectContaining({
        action: 'FILTER_UPDATE'
      })
    );
  });

  it('maintains accessibility compliance', async () => {
    const { container } = setupTest();

    // Test keyboard navigation
    const firstCheckbox = screen.getByLabelText(/filter by audio/i);
    firstCheckbox.focus();
    expect(document.activeElement).toBe(firstCheckbox);

    // Test screen reader announcements
    const announcement = screen.getByRole('alert');
    expect(announcement).toBeInTheDocument();

    // Test high contrast mode
    const { container: highContrastContainer } = setupTest(
      mockInitialFilters,
      mockSecurityContext,
      true
    );
    const panel = highContrastContainer.querySelector('.filter-panel');
    expect(panel).toHaveStyle({
      backgroundColor: '#000000',
      color: '#ffffff'
    });

    // Verify ARIA labels and roles
    expect(container.querySelector('[role="region"]')).toHaveAttribute(
      'aria-label',
      'Search filters'
    );
    expect(screen.getAllByRole('group')).toHaveLength(3);
  });

  it('handles error conditions securely', async () => {
    const { onFilterChange } = setupTest();

    // Simulate network error
    onFilterChange.mockRejectedValueOnce(new Error('Network error'));

    // Attempt filter change
    const checkbox = screen.getByLabelText(/filter by audio/i);
    await userEvent.click(checkbox);

    // Verify error handling
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/error updating/i);
    });

    // Verify security context maintained
    expect(screen.getByText(/RESTRICTED/i)).toBeInTheDocument();

    // Verify error is accessible
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveAttribute('aria-live', 'polite');
  });

  it('validates FedRAMP and CJIS compliance requirements', async () => {
    const { container } = setupTest();

    // Verify security headers
    expect(container.querySelector('[data-security-level]')).toHaveAttribute(
      'data-security-level',
      'RESTRICTED'
    );

    // Verify audit logging
    const checkbox = screen.getByLabelText(/filter by audio/i);
    await userEvent.click(checkbox);

    // Verify compliance metadata
    expect(container.querySelector('[data-compliance]')).toHaveAttribute(
      'data-compliance',
      'FEDRAMP_HIGH'
    );

    // Verify CJIS audit trail
    expect(console.log).toHaveBeenCalledWith(
      'Audit: Filter change',
      expect.objectContaining({
        userId: mockSecurityContext.userId
      })
    );
  });
});