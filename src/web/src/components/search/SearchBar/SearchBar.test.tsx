import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import SearchBar from './SearchBar';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Mock encryption hook
vi.mock('@company/encryption', () => ({
  useEncryption: () => ({
    encryptQuery: vi.fn((query) => `encrypted_${query}`),
    decryptResults: vi.fn((results) => results)
  })
}));

// Mock audit logging hook
vi.mock('../../../hooks/useAuditLog', () => ({
  useAuditLog: () => ({
    logSearchQuery: vi.fn(),
    logError: vi.fn()
  })
}));

// Mock rate limiting hook
vi.mock('../../../hooks/useRateLimiting', () => ({
  useRateLimiting: () => ({
    checkLimit: vi.fn(() => true),
    updateCounter: vi.fn()
  })
}));

describe('SearchBar', () => {
  const defaultProps = {
    placeholder: 'Search evidence...',
    className: 'custom-search',
    onSearch: vi.fn(),
    initialFilters: {
      dateRange: { startDate: '', endDate: '' },
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
    securityContext: {
      encryptionKey: 'test-key',
      classificationLevel: 'FEDRAMP_HIGH',
      userId: 'test-user',
      sessionId: 'test-session'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('userId', 'test-user');
    sessionStorage.setItem('sessionId', 'test-session');
  });

  describe('security compliance', () => {
    it('should encrypt search query before sending', async () => {
      const { store } = renderWithProviders(
        <SearchBar {...defaultProps} />,
        {
          preloadedState: {},
          securityContext: defaultProps.securityContext
        }
      );

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'test query');
      
      await waitFor(() => {
        expect(store.getState().search.query).toBe('encrypted_test query');
      });
    });

    it('should validate security context before search', async () => {
      const invalidProps = {
        ...defaultProps,
        securityContext: { ...defaultProps.securityContext, encryptionKey: null }
      };

      renderWithProviders(<SearchBar {...invalidProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'test');

      expect(await screen.findByText('Search failed')).toBeInTheDocument();
    });

    it('should enforce CJIS compliance for sensitive queries', async () => {
      const sensitiveProps = {
        ...defaultProps,
        securityContext: {
          ...defaultProps.securityContext,
          classificationLevel: 'SECRET'
        }
      };

      renderWithProviders(<SearchBar {...sensitiveProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'confidential');

      expect(screen.getByRole('searchbox')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-label', 'Search input');
      expect(searchInput).toHaveAttribute('aria-required', 'true');
    });

    it('should handle keyboard navigation', async () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      searchInput.focus();
      expect(document.activeElement).toBe(searchInput);

      fireEvent.keyPress(searchInput, { key: 'Enter', code: 'Enter' });
      await waitFor(() => {
        expect(defaultProps.onSearch).toHaveBeenCalled();
      });
    });

    it('should announce error messages to screen readers', async () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'a'); // Too short query

      const errorMessage = await screen.findByRole('alert');
      expect(errorMessage).toBeInTheDocument();
    });
  });

  describe('rate limiting', () => {
    it('should enforce hourly rate limits', async () => {
      const { rerender } = renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');

      // Simulate exceeding rate limit
      for (let i = 0; i < 1001; i++) {
        await userEvent.type(searchInput, `test query ${i}{enter}`);
        rerender(<SearchBar {...defaultProps} />);
      }

      expect(await screen.findByText(/rate limit exceeded/i)).toBeInTheDocument();
    });

    it('should handle burst limits correctly', async () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');

      // Simulate burst of requests
      for (let i = 0; i < 2001; i++) {
        await userEvent.type(searchInput, `test query ${i}{enter}`);
      }

      expect(await screen.findByText(/burst limit exceeded/i)).toBeInTheDocument();
    });
  });

  describe('compliance', () => {
    it('should validate FedRAMP requirements', async () => {
      const { store } = renderWithProviders(
        <SearchBar {...defaultProps} />,
        {
          preloadedState: {},
          complianceLevel: 'FEDRAMP_HIGH'
        }
      );

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'test query');

      await waitFor(() => {
        const state = store.getState();
        expect(state.search.securityContext.classificationLevel).toBe('FEDRAMP_HIGH');
      });
    });

    it('should maintain audit trail of searches', async () => {
      const { store } = renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'test query');

      await waitFor(() => {
        const state = store.getState();
        expect(state.search.searchHistory.length).toBeGreaterThan(0);
        expect(state.search.searchHistory[0].action).toBe('SEARCH_COMPLETED');
      });
    });

    it('should handle PII data appropriately', async () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, '123-45-6789'); // SSN pattern

      expect(await screen.findByText(/contains sensitive information/i)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should display validation errors', async () => {
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'a'); // Too short

      expect(await screen.findByRole('alert')).toHaveTextContent(/minimum length/i);
    });

    it('should handle network errors securely', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'network error test');

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });
});