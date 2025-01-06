/**
 * Test suite for Search page component implementing FedRAMP High and CJIS compliance validation
 * with comprehensive security, accessibility, and performance testing.
 * @version 1.0.0
 */

import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '@axe-core/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import Search from './Search';
import { server } from '../../../tests/mocks/server';

// Security classification levels
const SECURITY_LEVELS = {
  TOP_SECRET: 'top_secret',
  SECRET: 'secret',
  CONFIDENTIAL: 'confidential',
  UNCLASSIFIED: 'unclassified'
};

// Mock secure search results
const mockSecureResults = [
  {
    id: '1',
    content: 'Encrypted test evidence 1',
    metadata: {
      classification: SECURITY_LEVELS.CONFIDENTIAL,
      timestamp: new Date().toISOString()
    }
  },
  {
    id: '2',
    content: 'Encrypted test evidence 2',
    metadata: {
      classification: SECURITY_LEVELS.SECRET,
      timestamp: new Date().toISOString()
    }
  }
];

describe('Search Page Security and Compliance', () => {
  beforeEach(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  test('validates FedRAMP compliance requirements', async () => {
    const { container } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.SECRET} />,
      {
        preloadedState: {
          search: {
            results: [],
            loading: false,
            error: null
          }
        }
      }
    );

    // Verify security headers
    expect(container.querySelector('[data-security-level]'))
      .toHaveAttribute('data-security-level', SECURITY_LEVELS.SECRET);

    // Verify encryption indicators
    expect(container.querySelector('[data-encryption-enabled]'))
      .toBeInTheDocument();

    // Verify audit logging elements
    expect(container.querySelector('[data-audit-enabled]'))
      .toBeInTheDocument();
  });

  test('ensures CJIS compliance for search operations', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.SECRET} />
    );

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, 'test query');

    // Verify CJIS compliant headers in request
    await waitFor(() => {
      const state = store.getState();
      expect(state.search.securityContext.classificationLevel)
        .toBe(SECURITY_LEVELS.SECRET);
    });

    // Verify audit trail creation
    expect(store.getState().search.auditLog).toHaveLength(1);
  });
});

describe('Search Functionality', () => {
  test('handles encrypted search with security context', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.SECRET} />,
      {
        preloadedState: {
          search: {
            results: mockSecureResults,
            loading: false
          }
        }
      }
    );

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, 'classified evidence');

    // Verify encrypted search execution
    await waitFor(() => {
      const state = store.getState();
      expect(state.search.query).toBeTruthy();
      expect(state.search.results).toHaveLength(2);
    });

    // Verify security classification display
    const results = screen.getAllByRole('article');
    expect(results[0]).toHaveAttribute('data-classification');
  });

  test('enforces rate limiting on search requests', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.SECRET} />
    );

    const searchInput = screen.getByRole('searchbox');

    // Attempt rapid searches
    for (let i = 0; i < 5; i++) {
      await user.clear(searchInput);
      await user.type(searchInput, `test query ${i}`);
    }

    // Verify rate limit enforcement
    await waitFor(() => {
      const state = store.getState();
      expect(state.search.error).toMatch(/rate limit/i);
    });
  });
});

describe('Accessibility Compliance', () => {
  test('meets WCAG 2.1 standards', async () => {
    const { container } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />
    );

    // Run axe accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('supports keyboard navigation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />);

    // Tab through interactive elements
    await user.tab();
    expect(screen.getByRole('searchbox')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: /filter/i })).toHaveFocus();
  });

  test('announces search results to screen readers', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />,
      {
        preloadedState: {
          search: {
            results: mockSecureResults,
            loading: false
          }
        }
      }
    );

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, 'test');

    // Verify ARIA live regions
    await waitFor(() => {
      const announcement = screen.getByRole('status');
      expect(announcement).toHaveTextContent(/found \d+ results/i);
    });
  });
});

describe('Performance Requirements', () => {
  test('renders search results within performance budget', async () => {
    const startTime = performance.now();

    renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />,
      {
        preloadedState: {
          search: {
            results: Array(1000).fill(mockSecureResults[0]),
            loading: false
          }
        }
      }
    );

    const renderTime = performance.now() - startTime;
    expect(renderTime).toBeLessThan(200); // 200ms budget
  });

  test('implements virtual scrolling for large result sets', async () => {
    const { container } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />,
      {
        preloadedState: {
          search: {
            results: Array(10000).fill(mockSecureResults[0]),
            loading: false
          }
        }
      }
    );

    // Verify only visible results are rendered
    const renderedResults = container.querySelectorAll('[role="article"]');
    expect(renderedResults.length).toBeLessThan(100);
  });
});

describe('Error Handling', () => {
  test('handles security violations appropriately', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />
    );

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, 'top_secret_query');

    // Verify security violation handling
    await waitFor(() => {
      const error = screen.getByRole('alert');
      expect(error).toHaveTextContent(/security clearance/i);
    });
  });

  test('logs security incidents', async () => {
    const { store } = renderWithProviders(
      <Search accessLevel={SECURITY_LEVELS.CONFIDENTIAL} />
    );

    // Simulate security incident
    store.dispatch({
      type: 'search/securityViolation',
      payload: { message: 'Unauthorized access attempt' }
    });

    // Verify incident logging
    expect(store.getState().search.securityIncidents).toHaveLength(1);
  });
});