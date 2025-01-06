import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // v14.0.0
import { describe, it, expect, beforeEach } from '@jest/globals'; // v29.6.0
import userEvent from '@testing-library/user-event'; // v14.4.3
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.3
import Settings from './Settings';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { THEME, TYPOGRAPHY } from '../../constants/ui.constants';

// Add axe accessibility matcher
expect.extend(toHaveNoViolations);

// Mock security context for FedRAMP compliance
const mockSecurityContext = {
  classificationLevel: 'FEDRAMP_HIGH',
  userId: 'test-user-id',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL',
  sessionId: crypto.randomUUID(),
  clearanceLevel: 'SECRET',
  auditEnabled: true
};

// Mock audit logger
const mockAuditLogger = {
  logSettingChange: jest.fn(),
  logSecurityEvent: jest.fn()
};

describe('Settings Page', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Security Compliance', () => {
    it('should validate FedRAMP High security context before rendering', async () => {
      const { container } = renderWithProviders(<Settings />, {
        securityContext: mockSecurityContext
      });

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // Verify security classification is applied
      expect(container.firstChild).toHaveAttribute(
        'data-classification',
        'FEDRAMP_HIGH'
      );
    });

    it('should audit log all settings changes', async () => {
      const { store } = renderWithProviders(<Settings />, {
        securityContext: mockSecurityContext
      });

      const themeSelect = screen.getByLabelText(/theme/i);
      await userEvent.selectOptions(themeSelect, 'DARK');

      expect(mockAuditLogger.logSettingChange).toHaveBeenCalledWith({
        userId: mockSecurityContext.userId,
        action: 'SETTING_UPDATE',
        setting: 'theme',
        oldValue: 'LIGHT',
        newValue: 'DARK',
        timestamp: expect.any(Date),
        securityLevel: 'STANDARD'
      });
    });

    it('should enforce CJIS security controls for sensitive settings', async () => {
      renderWithProviders(<Settings />, {
        securityContext: mockSecurityContext
      });

      const keyboardNavCheckbox = screen.getByLabelText(/enhanced keyboard navigation/i);
      await userEvent.click(keyboardNavCheckbox);

      expect(mockAuditLogger.logSettingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          securityLevel: 'CJIS'
        })
      );
    });
  });

  describe('Theme Configuration', () => {
    it('should correctly apply theme changes', async () => {
      const { store } = renderWithProviders(<Settings />);

      const themeSelect = screen.getByLabelText(/theme/i);
      await userEvent.selectOptions(themeSelect, 'DARK');

      expect(store.getState().ui.theme).toBe('DARK');
      expect(localStorage.getItem('theme')).toBe('DARK');
    });

    it('should validate color contrast ratios meet WCAG 2.1 AA standards', async () => {
      const { container } = renderWithProviders(<Settings />);

      // Test light theme contrast
      const lightThemeColors = THEME.LIGHT;
      expect(getContrastRatio(
        lightThemeColors.TEXT,
        lightThemeColors.BACKGROUND
      )).toBeGreaterThanOrEqual(4.5);

      // Test dark theme contrast
      const darkThemeColors = THEME.DARK;
      expect(getContrastRatio(
        darkThemeColors.TEXT,
        darkThemeColors.BACKGROUND
      )).toBeGreaterThanOrEqual(4.5);
    });

    it('should persist high contrast mode setting', async () => {
      const { store } = renderWithProviders(<Settings />);

      const highContrastCheckbox = screen.getByLabelText(/high contrast mode/i);
      await userEvent.click(highContrastCheckbox);

      expect(store.getState().ui.isHighContrast).toBe(true);
      expect(localStorage.getItem('highContrast')).toBe('true');
    });
  });

  describe('Accessibility Features', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderWithProviders(<Settings />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      renderWithProviders(<Settings />);

      const firstInput = screen.getByLabelText(/theme/i);
      firstInput.focus();

      await userEvent.tab();
      expect(screen.getByLabelText(/high contrast mode/i)).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByLabelText(/color blind mode/i)).toHaveFocus();
    });

    it('should correctly apply text size changes', async () => {
      const { store } = renderWithProviders(<Settings />);

      const textSizeSelect = screen.getByLabelText(/text size/i);
      await userEvent.selectOptions(textSizeSelect, 'large');

      expect(store.getState().ui.textSize).toBe('large');
      expect(store.getState().ui.accessibility.textSize).toBe('large');
      expect(localStorage.getItem('textSize')).toBe('large');
    });

    it('should handle screen reader optimizations', async () => {
      const { store } = renderWithProviders(<Settings />);

      const screenReaderCheckbox = screen.getByLabelText(/screen reader optimized/i);
      await userEvent.click(screenReaderCheckbox);

      expect(store.getState().ui.accessibility.screenReaderOptimized).toBe(true);
      expect(localStorage.getItem('accessibility')).toContain('"screenReaderOptimized":true');
    });

    it('should support color blind modes', async () => {
      const { store } = renderWithProviders(<Settings />);

      const colorBlindSelect = screen.getByLabelText(/color blind mode/i);
      await userEvent.selectOptions(colorBlindSelect, 'protanopia');

      expect(store.getState().ui.accessibility.colorBlindMode).toBe('protanopia');
    });
  });

  describe('Performance Requirements', () => {
    it('should complete settings changes within 100ms', async () => {
      const startTime = performance.now();
      const { store } = renderWithProviders(<Settings />);

      const themeSelect = screen.getByLabelText(/theme/i);
      await userEvent.selectOptions(themeSelect, 'DARK');

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle multiple rapid setting changes', async () => {
      const { store } = renderWithProviders(<Settings />);

      const actions = [
        async () => userEvent.selectOptions(screen.getByLabelText(/theme/i), 'DARK'),
        async () => userEvent.click(screen.getByLabelText(/high contrast mode/i)),
        async () => userEvent.selectOptions(screen.getByLabelText(/text size/i), 'large')
      ];

      await Promise.all(actions.map(action => action()));

      expect(store.getState().ui.theme).toBe('DARK');
      expect(store.getState().ui.isHighContrast).toBe(true);
      expect(store.getState().ui.textSize).toBe('large');
    });
  });
});

// Helper function to calculate color contrast ratio
function getContrastRatio(foreground: string, background: string): number {
  const getLuminance = (color: string) => {
    const hex = color.replace('#', '');
    const rgb = parseInt(hex, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(val => 
      val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  
  return (brightest + 0.05) / (darkest + 0.05);
}