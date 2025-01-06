import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.3
import MainContent from './MainContent';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

describe('MainContent Component', () => {
  // Mock content for consistent testing
  const mockContent = <div data-testid="test-content">Test Content</div>;

  // Security context setup for FedRAMP/CJIS compliance
  const mockSecurityContext = {
    classificationLevel: 'FEDRAMP_HIGH',
    userId: 'test-user-id',
    agencyId: 'test-agency',
    jurisdiction: 'FEDERAL',
    sessionId: crypto.randomUUID(),
    clearanceLevel: 'SECRET',
    auditEnabled: true
  };

  // Mock store setup with loading states
  const mockStore = {
    ui: {
      loadingStates: {},
      theme: 'LIGHT',
      isHighContrast: false
    }
  };

  beforeEach(() => {
    // Reset mocks and store before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
    jest.resetAllMocks();
  });

  it('should render with proper security context', async () => {
    const { container } = renderWithProviders(
      <MainContent data-testid="main-content">
        {mockContent}
      </MainContent>,
      {
        preloadedState: mockStore,
        securityContext: mockSecurityContext
      }
    );

    // Verify security attributes
    const mainElement = screen.getByTestId('main-content');
    expect(mainElement).toHaveAttribute('data-classification', 'FEDRAMP_HIGH');
    expect(mainElement).toHaveAttribute('data-jurisdiction', 'FEDERAL');
  });

  it('should meet accessibility requirements', async () => {
    const { container } = renderWithProviders(
      <MainContent>
        {mockContent}
      </MainContent>,
      {
        preloadedState: mockStore,
        securityContext: mockSecurityContext
      }
    );

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify ARIA attributes
    const mainElement = screen.getByRole('main');
    expect(mainElement).toHaveAttribute('aria-busy', 'false');
  });

  it('should handle loading states correctly', async () => {
    const loadingStore = {
      ui: {
        ...mockStore.ui,
        loadingStates: { 'test-loading': true }
      }
    };

    renderWithProviders(
      <MainContent>
        {mockContent}
      </MainContent>,
      {
        preloadedState: loadingStore,
        securityContext: mockSecurityContext
      }
    );

    // Verify loading state
    const loader = screen.getByRole('progressbar');
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveAttribute('aria-busy', 'true');
    expect(loader).toHaveAttribute('aria-label', 'Loading content...');
  });

  it('should handle theme changes correctly', async () => {
    const darkThemeStore = {
      ui: {
        ...mockStore.ui,
        theme: 'DARK'
      }
    };

    const { rerender } = renderWithProviders(
      <MainContent>
        {mockContent}
      </MainContent>,
      {
        preloadedState: darkThemeStore,
        securityContext: mockSecurityContext
      }
    );

    // Verify dark theme classes
    const mainElement = screen.getByRole('main');
    expect(mainElement).toHaveClass('main-content--theme-dark');

    // Test theme transition
    rerender(
      <MainContent>
        {mockContent}
      </MainContent>
    );

    await waitFor(() => {
      expect(mainElement).toHaveStyle({
        willChange: 'background-color',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden'
      });
    });
  });

  it('should handle high contrast mode correctly', async () => {
    const highContrastStore = {
      ui: {
        ...mockStore.ui,
        isHighContrast: true
      }
    };

    renderWithProviders(
      <MainContent>
        {mockContent}
      </MainContent>,
      {
        preloadedState: highContrastStore,
        securityContext: mockSecurityContext
      }
    );

    const mainElement = screen.getByRole('main');
    expect(mainElement).toHaveClass('main-content--high-contrast');
  });

  it('should handle responsive behavior', async () => {
    // Mock different viewport sizes
    const viewports = [
      { width: 320, height: 568 },  // Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1024, height: 768 }, // Desktop
      { width: 1440, height: 900 }  // Large Desktop
    ];

    for (const viewport of viewports) {
      window.innerWidth = viewport.width;
      window.innerHeight = viewport.height;
      window.dispatchEvent(new Event('resize'));

      const { container } = renderWithProviders(
        <MainContent>
          {mockContent}
        </MainContent>,
        {
          preloadedState: mockStore,
          securityContext: mockSecurityContext
        }
      );

      // Verify responsive layout adjustments
      const mainElement = screen.getByRole('main');
      const computedStyle = window.getComputedStyle(mainElement);
      
      if (viewport.width < 768) {
        expect(computedStyle.padding).toBe('16px');
      } else if (viewport.width < 1024) {
        expect(computedStyle.padding).toBe('24px');
      } else {
        expect(computedStyle.padding).toBe('32px');
      }
    }
  });

  it('should maintain security context during updates', async () => {
    const { rerender } = renderWithProviders(
      <MainContent>
        {mockContent}
      </MainContent>,
      {
        preloadedState: mockStore,
        securityContext: mockSecurityContext
      }
    );

    // Update content
    const newContent = <div data-testid="updated-content">Updated Content</div>;
    rerender(
      <MainContent>
        {newContent}
      </MainContent>
    );

    // Verify security context is maintained
    const mainElement = screen.getByRole('main');
    expect(mainElement).toHaveAttribute('data-classification', 'FEDRAMP_HIGH');
    expect(mainElement).toHaveAttribute('data-jurisdiction', 'FEDERAL');

    // Verify content update
    expect(screen.getByTestId('updated-content')).toBeInTheDocument();
  });

  it('should handle error states gracefully', async () => {
    const errorContent = <div>Error loading content</div>;
    
    renderWithProviders(
      <MainContent>
        {errorContent}
      </MainContent>,
      {
        preloadedState: {
          ui: {
            ...mockStore.ui,
            error: 'Test error message'
          }
        },
        securityContext: mockSecurityContext
      }
    );

    const mainElement = screen.getByRole('main');
    expect(mainElement).toContainElement(screen.getByText('Error loading content'));
  });
});