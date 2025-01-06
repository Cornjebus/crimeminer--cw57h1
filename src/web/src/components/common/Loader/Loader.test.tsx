import React from 'react'; // v18.0.0
import { screen, render, within } from '@testing-library/react'; // v14.0.0
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'; // v29.0.0
import Loader from './Loader';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import styles from './Loader.scss';

describe('Loader Component', () => {
  // Clean up after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders with default props', () => {
      renderWithProviders(<Loader />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveAttribute('aria-label', 'Loading...');
      expect(loader).toHaveAttribute('aria-busy', 'true');
      expect(loader).toHaveAttribute('aria-live', 'polite');
    });

    it('renders with custom aria-label', () => {
      renderWithProviders(<Loader ariaLabel="Processing evidence..." />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveAttribute('aria-label', 'Processing evidence...');
      expect(screen.getByText('Processing evidence...')).toBeInTheDocument();
    });

    it('applies correct size classes', () => {
      const { rerender } = renderWithProviders(<Loader size="small" />);
      expect(screen.getByRole('progressbar')).toHaveClass(styles['loader--small']);

      rerender(<Loader size="large" />);
      expect(screen.getByRole('progressbar')).toHaveClass(styles['loader--large']);

      rerender(<Loader size="medium" />);
      expect(screen.getByRole('progressbar')).not.toHaveClass(styles['loader--small']);
      expect(screen.getByRole('progressbar')).not.toHaveClass(styles['loader--large']);
    });
  });

  describe('Overlay Mode', () => {
    it('renders in overlay mode', () => {
      renderWithProviders(<Loader overlay />);
      
      const overlayContainer = screen.getByRole('dialog');
      expect(overlayContainer).toBeInTheDocument();
      expect(overlayContainer).toHaveAttribute('aria-modal', 'true');
      expect(overlayContainer).toHaveAttribute('tabIndex', '-1');
      expect(overlayContainer).toHaveClass(styles.loader__overlay);
      
      const loader = within(overlayContainer).getByRole('progressbar');
      expect(loader).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('supports reduced motion preference', () => {
      renderWithProviders(<Loader reducedMotion />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveClass(styles['loader--reduced-motion']);
      expect(within(loader).getByClassName(styles.loader__spinner))
        .toHaveClass(styles['loader--reduced-motion']);
    });

    it('supports high contrast mode', () => {
      renderWithProviders(<Loader highContrast />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveClass(styles['loader--high-contrast']);
      expect(within(loader).getByClassName(styles.loader__spinner))
        .toHaveClass(styles['loader--high-contrast']);
    });

    it('maintains focus management in overlay mode', () => {
      renderWithProviders(<Loader overlay />);
      
      const overlayContainer = screen.getByRole('dialog');
      expect(overlayContainer).toHaveAttribute('tabIndex', '-1');
      expect(document.activeElement).toBe(overlayContainer);
    });
  });

  describe('Theme Compatibility', () => {
    it('adapts to light theme', () => {
      renderWithProviders(<Loader />, {
        preloadedState: {
          theme: { mode: 'light' }
        }
      });

      const spinner = screen.getByClassName(styles.loader__spinner);
      expect(spinner).toHaveStyle({
        borderTopColor: '#1A73E8' // Primary color in light theme
      });
    });

    it('adapts to dark theme', () => {
      renderWithProviders(<Loader />, {
        preloadedState: {
          theme: { mode: 'dark' }
        }
      });

      const spinner = screen.getByClassName(styles.loader__spinner);
      expect(spinner).toHaveStyle({
        borderTopColor: '#4285F4' // Primary color in dark theme
      });
    });
  });

  describe('Performance Optimizations', () => {
    it('applies performance optimization styles', () => {
      renderWithProviders(<Loader />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveStyle({
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden'
      });

      const spinner = within(loader).getByClassName(styles.loader__spinner);
      expect(spinner).toHaveStyle({
        contain: 'layout'
      });
    });
  });

  describe('Custom Styling', () => {
    it('accepts and applies custom className', () => {
      const customClass = 'custom-loader';
      renderWithProviders(<Loader className={customClass} />);
      
      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveClass(customClass);
    });
  });

  describe('Error Handling', () => {
    it('maintains accessibility when parent container is hidden', () => {
      const { container } = renderWithProviders(
        <div style={{ display: 'none' }}>
          <Loader />
        </div>
      );
      
      const loader = within(container).getByRole('progressbar');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Security Compliance', () => {
    it('validates security context in overlay mode', () => {
      renderWithProviders(<Loader overlay />, {
        securityContext: {
          classificationLevel: 'FEDRAMP_HIGH',
          userId: 'test-user-id',
          sessionId: 'test-session-id'
        }
      });

      const overlayContainer = screen.getByRole('dialog');
      expect(overlayContainer).toHaveAttribute('data-classification', 'FEDRAMP_HIGH');
    });
  });
});