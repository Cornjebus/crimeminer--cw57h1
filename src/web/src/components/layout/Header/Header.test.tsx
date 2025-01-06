import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { axe, toHaveNoViolations } from '@axe-core/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import Header from './Header';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

describe('Header Component', () => {
  // Mock hooks and utilities
  const mockLogout = vi.fn();
  const mockResetSessionTimer = vi.fn();
  const mockHandleActivity = vi.fn();

  beforeEach(() => {
    // Setup security context and mock data
    vi.mock('../../../hooks/useAuth', () => ({
      useAuth: () => ({
        user: {
          username: 'test.investigator',
          securityClearance: 'SECRET',
          sessionTimeout: 900000
        },
        logout: mockLogout,
        securityContext: {
          lastValidated: new Date(),
          complianceStatus: 'COMPLIANT'
        },
        complianceViolations: []
      })
    }));

    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Reset document body
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Security Features', () => {
    it('enforces proper security clearance for navigation', async () => {
      const { rerender } = renderWithProviders(
        <Header securityLevel="FEDRAMP_HIGH" />
      );

      // Verify security level attribute
      expect(screen.getByRole('banner')).toHaveAttribute(
        'data-security-level',
        'FEDRAMP_HIGH'
      );

      // Test with insufficient clearance
      rerender(
        <Header securityLevel="TOP_SECRET" />
      );

      // Verify restricted navigation options
      expect(screen.queryByText('Restricted Content')).not.toBeInTheDocument();
    });

    it('handles secure session timeout correctly', async () => {
      const { rerender } = renderWithProviders(
        <Header sessionTimeout={5000} />
      );

      // Advance timer to trigger warning
      vi.advanceTimersByTime(4000);

      // Verify timeout warning
      expect(screen.getByText(/Session will expire/i)).toBeInTheDocument();

      // Test session extension
      const extendButton = screen.getByText('Extend Session');
      fireEvent.click(extendButton);

      // Verify timer reset
      expect(mockResetSessionTimer).toHaveBeenCalled();

      // Advance to timeout
      vi.advanceTimersByTime(5000);

      // Verify logout called
      expect(mockLogout).toHaveBeenCalled();
    });

    it('displays security warnings for compliance violations', () => {
      renderWithProviders(
        <Header />,
        {
          preloadedState: {
            auth: {
              complianceViolations: [
                { type: 'SECURITY_POLICY', message: 'Test violation' }
              ]
            }
          }
        }
      );

      // Verify warning display
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Security compliance violations detected'
      );
    });
  });

  describe('Accessibility Requirements', () => {
    it('meets WCAG 2.1 AA requirements', async () => {
      const { container } = renderWithProviders(<Header />);
      
      // Run axe accessibility tests
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports keyboard navigation', () => {
      renderWithProviders(<Header />);

      // Test tab navigation
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        button.focus();
        expect(document.activeElement).toBe(button);
      });
    });

    it('provides proper ARIA labels', () => {
      renderWithProviders(<Header />);

      // Verify ARIA labels
      expect(screen.getByLabelText('CrimeMiner Home')).toBeInTheDocument();
      expect(screen.getByLabelText('Search evidence and cases')).toBeInTheDocument();
      expect(screen.getByLabelText(/Profile:/)).toBeInTheDocument();
    });

    it('handles high contrast mode', () => {
      renderWithProviders(<Header />);

      // Simulate high contrast mode
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('header');

      // Force high contrast mode
      header.setAttribute('forced-colors', 'active');
      
      // Verify contrast styles applied
      expect(getComputedStyle(header).borderColor).toBe('CanvasText');
    });
  });

  describe('Theme Management', () => {
    it('applies correct theme styles', () => {
      const { rerender } = renderWithProviders(<Header />);

      // Verify light theme styles
      expect(screen.getByRole('banner')).toHaveStyle({
        background: '#FFFFFF'
      });

      // Test dark theme
      rerender(
        <Header />,
        {
          preloadedState: {
            theme: { isDarkMode: true }
          }
        }
      );

      // Verify dark theme styles
      expect(screen.getByRole('banner')).toHaveStyle({
        background: '#1E1E1E'
      });
    });

    it('maintains theme preferences across sessions', () => {
      // Set theme preference
      localStorage.setItem('theme', 'dark');

      renderWithProviders(<Header />);

      // Verify theme persistence
      expect(screen.getByRole('banner')).toHaveStyle({
        background: '#1E1E1E'
      });
    });
  });

  describe('User Controls', () => {
    it('handles user profile interactions', async () => {
      renderWithProviders(<Header />);

      const profileButton = screen.getByLabelText(/Profile:/);
      fireEvent.click(profileButton);

      // Verify profile interaction
      await waitFor(() => {
        expect(mockHandleActivity).toHaveBeenCalled();
      });
    });

    it('manages notifications correctly', () => {
      renderWithProviders(<Header />);

      const alertsButton = screen.getByLabelText('View notifications');
      fireEvent.click(alertsButton);

      // Verify alerts interaction
      expect(mockHandleActivity).toHaveBeenCalled();
    });

    it('executes secure logout', async () => {
      renderWithProviders(<Header />);

      const logoutButton = screen.getByLabelText('Log out');
      fireEvent.click(logoutButton);

      // Verify logout process
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Search Functionality', () => {
    it('handles search input correctly', () => {
      renderWithProviders(<Header />);

      const searchInput = screen.getByLabelText('Search evidence and cases');
      fireEvent.change(searchInput, { target: { value: 'test search' } });

      // Verify search interaction
      expect(searchInput).toHaveValue('test search');
    });

    it('manages search expansion on mobile', () => {
      renderWithProviders(<Header />);

      const searchContainer = screen.getByRole('searchbox').parentElement;
      expect(searchContainer).toHaveClass('header__search');

      // Simulate mobile search expansion
      fireEvent.click(searchContainer as HTMLElement);
      expect(searchContainer).toHaveClass('header__search--expanded');
    });
  });
});