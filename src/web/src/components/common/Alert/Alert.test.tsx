import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { axe, toHaveNoViolations } from 'jest-axe';
import Alert from './Alert';
import { ThemeProvider } from '../../../context/ThemeContext';
import { SecurityProvider } from '../../../context/SecurityContext';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock security context values
const mockSecurityContext = {
  logSecurityEvent: jest.fn(),
  validateContent: jest.fn(),
  sanitizeContent: jest.fn((content) => content),
};

// Helper function to render Alert with providers
const renderSecureAlert = (props: React.ComponentProps<typeof Alert>, securityContext = mockSecurityContext) => {
  return render(
    <SecurityProvider value={securityContext}>
      <ThemeProvider>
        <Alert {...props} />
      </ThemeProvider>
    </SecurityProvider>
  );
};

describe('Alert Component', () => {
  // Clear mocks between tests
  beforeEach(() => {
    mockSecurityContext.logSecurityEvent.mockClear();
    mockSecurityContext.validateContent.mockClear();
  });

  describe('Rendering and Security', () => {
    it('renders with secure content validation', () => {
      const alertText = 'Test alert message';
      renderSecureAlert({ children: alertText });
      
      expect(mockSecurityContext.validateContent).toHaveBeenCalledWith(alertText);
      expect(screen.getByRole('alert')).toHaveTextContent(alertText);
    });

    it('logs security events on critical actions', () => {
      const onDismiss = jest.fn();
      renderSecureAlert({ 
        children: 'Dismissible alert',
        dismissible: true,
        onDismiss 
      });

      fireEvent.click(screen.getByRole('button'));
      
      expect(mockSecurityContext.logSecurityEvent).toHaveBeenCalledWith({
        action: 'ALERT_DISMISSED',
        component: 'Alert',
        timestamp: expect.any(Number)
      });
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('Accessibility Compliance', () => {
    it('meets WCAG 2.1 AA standards', async () => {
      const { container } = renderSecureAlert({ 
        children: 'Accessible alert',
        type: 'info'
      });
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA attributes', () => {
      renderSecureAlert({
        children: 'ARIA test alert',
        type: 'error',
        ariaLabel: 'Error notification'
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-label', 'Error notification');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
      expect(alert).toHaveAttribute('aria-atomic', 'true');
    });

    it('supports keyboard navigation', () => {
      const onDismiss = jest.fn();
      renderSecureAlert({
        children: 'Keyboard nav test',
        dismissible: true,
        onDismiss
      });

      const alert = screen.getByRole('alert');
      const closeButton = screen.getByRole('button');

      // Test keyboard focus management
      fireEvent.keyDown(alert, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(closeButton);

      // Test keyboard dismissal
      fireEvent.keyDown(closeButton, { key: 'Enter' });
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('Theme Support', () => {
    it('renders correctly in light theme', () => {
      renderSecureAlert({
        children: 'Light theme alert',
        type: 'success'
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('alert--success');
      // Verify computed styles match light theme variables
      const styles = window.getComputedStyle(alert);
      expect(styles.backgroundColor).toBe('rgba(52, 168, 83, 0.1)');
    });

    it('renders correctly in dark theme', () => {
      renderSecureAlert({
        children: 'Dark theme alert',
        type: 'error'
      });

      // Simulate dark mode
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const alert = screen.getByRole('alert');
      const styles = window.getComputedStyle(alert);
      expect(styles.backgroundColor).toBe('rgba(234, 67, 53, 0.2)');
      
      // Cleanup
      document.documentElement.removeAttribute('data-theme');
    });
  });

  describe('RTL Support', () => {
    it('renders correctly in RTL mode', () => {
      renderSecureAlert({
        children: 'RTL alert test',
        isRTL: true
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('dir', 'rtl');
      expect(alert).toHaveClass('alert--rtl');
    });

    it('adjusts keyboard navigation for RTL', () => {
      renderSecureAlert({
        children: 'RTL keyboard test',
        dismissible: true,
        isRTL: true
      });

      const alert = screen.getByRole('alert');
      const closeButton = screen.getByRole('button');

      fireEvent.keyDown(alert, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(closeButton);
    });
  });

  describe('Alert Types', () => {
    it.each([
      ['success', '✓'],
      ['error', '✕'],
      ['warning', '⚠'],
      ['info', 'ℹ']
    ])('renders correct icon for %s type', (type, expectedIcon) => {
      renderSecureAlert({
        children: `${type} alert`,
        type: type as 'success' | 'error' | 'warning' | 'info'
      });

      const icon = screen.getByText(expectedIcon);
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Dismissible Behavior', () => {
    it('handles dismiss with security logging', () => {
      const onDismiss = jest.fn();
      renderSecureAlert({
        children: 'Dismissible test',
        dismissible: true,
        onDismiss
      });

      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      // Test click dismissal
      fireEvent.click(closeButton);
      expect(onDismiss).toHaveBeenCalled();
      expect(mockSecurityContext.logSecurityEvent).toHaveBeenCalled();

      // Test keyboard dismissal
      fireEvent.keyDown(closeButton, { key: 'Enter' });
      expect(onDismiss).toHaveBeenCalledTimes(2);
    });

    it('handles escape key dismissal', () => {
      const onDismiss = jest.fn();
      renderSecureAlert({
        children: 'Escape key test',
        dismissible: true,
        onDismiss
      });

      fireEvent.keyDown(screen.getByRole('alert'), { key: 'Escape' });
      expect(onDismiss).toHaveBeenCalled();
    });
  });
});