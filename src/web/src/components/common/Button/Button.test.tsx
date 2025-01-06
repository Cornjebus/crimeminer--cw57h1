import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { expect, describe, it, jest, beforeEach } from '@jest/globals';
import Button from './Button';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

describe('Button Component', () => {
  // Mock functions
  const mockOnClick = jest.fn();
  const mockOnEmergencyConfirm = jest.fn();
  const mockHapticFeedback = jest.fn();

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Mock navigator vibrate API
    Object.defineProperty(window.navigator, 'vibrate', {
      value: mockHapticFeedback,
      writable: true
    });
  });

  describe('Rendering Tests', () => {
    it('renders with default props', () => {
      renderWithProviders(<Button>Test Button</Button>);
      const button = screen.getByTestId('crimeminer-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('button', 'button--primary', 'button--medium');
    });

    it('applies variant styles correctly', () => {
      const { rerender } = renderWithProviders(
        <Button variant="primary">Primary</Button>
      );
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--primary');

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--secondary');

      rerender(<Button variant="emergency">Emergency</Button>);
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--emergency');
    });

    it('applies size styles correctly', () => {
      const { rerender } = renderWithProviders(
        <Button size="small">Small</Button>
      );
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--small');

      rerender(<Button size="large">Large</Button>);
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--large');
    });

    it('renders with custom className', () => {
      renderWithProviders(
        <Button className="custom-class">Custom</Button>
      );
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('custom-class');
    });

    it('renders with icon', () => {
      renderWithProviders(
        <Button icon={<span data-testid="test-icon">Icon</span>}>
          With Icon
        </Button>
      );
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
      expect(screen.getByTestId('test-icon').parentElement).toHaveClass('button__icon');
    });
  });

  describe('Interaction Tests', () => {
    it('handles click events', () => {
      renderWithProviders(
        <Button onClick={mockOnClick}>Click Me</Button>
      );
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('prevents click when disabled', () => {
      renderWithProviders(
        <Button onClick={mockOnClick} disabled>Disabled</Button>
      );
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('handles emergency confirmation flow', async () => {
      renderWithProviders(
        <Button 
          variant="emergency"
          requireConfirmation
          onEmergencyConfirm={mockOnEmergencyConfirm}
        >
          Emergency Action
        </Button>
      );

      // First click initiates confirmation
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      expect(screen.getByText('Confirm Emergency Action')).toBeInTheDocument();
      expect(mockOnEmergencyConfirm).not.toHaveBeenCalled();

      // Second click confirms action
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      expect(mockOnEmergencyConfirm).toHaveBeenCalledTimes(1);
    });

    it('provides haptic feedback when enabled', () => {
      renderWithProviders(
        <Button onClick={mockOnClick} touchFeedback="vibrate">
          Haptic Button
        </Button>
      );
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      expect(mockHapticFeedback).toHaveBeenCalledWith(50);
    });
  });

  describe('Accessibility Tests', () => {
    it('meets WCAG accessibility requirements', async () => {
      const { container } = renderWithProviders(
        <Button aria-label="Accessible Button">Click Me</Button>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides appropriate ARIA attributes', () => {
      renderWithProviders(
        <Button 
          disabled 
          variant="emergency"
          aria-label="Emergency Action"
        >
          Emergency
        </Button>
      );
      const button = screen.getByTestId('crimeminer-button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-label', 'Emergency Action');
      expect(button).toHaveAttribute('role', 'alert');
    });

    it('maintains focus visibility', () => {
      renderWithProviders(<Button>Focus Test</Button>);
      const button = screen.getByTestId('crimeminer-button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });

  describe('Theme and Visual Tests', () => {
    it('applies night mode styles correctly', () => {
      renderWithProviders(
        <Button nightModeEnabled>Night Mode</Button>
      );
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--night-mode');
    });

    it('applies high contrast styles correctly', () => {
      renderWithProviders(
        <Button highContrast>High Contrast</Button>
      );
      expect(screen.getByTestId('crimeminer-button')).toHaveClass('button--high-contrast');
    });
  });

  describe('Security Tests', () => {
    it('prevents double submission on emergency actions', async () => {
      renderWithProviders(
        <Button 
          variant="emergency"
          onClick={mockOnClick}
          requireConfirmation
        >
          Emergency Action
        </Button>
      );

      // Rapid clicks should not trigger multiple confirmations
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      fireEvent.click(screen.getByTestId('crimeminer-button'));
      fireEvent.click(screen.getByTestId('crimeminer-button'));

      expect(screen.getByText('Confirm Emergency Action')).toBeInTheDocument();
      expect(mockOnClick).not.toHaveBeenCalled();

      // Wait for confirmation timeout
      await waitFor(() => {
        expect(screen.queryByText('Confirm Emergency Action')).not.toBeInTheDocument();
      }, { timeout: 3100 });
    });

    it('handles security context validation', () => {
      const securityContext = {
        classificationLevel: 'SECRET',
        userId: 'test-user',
        clearanceLevel: 'TOP_SECRET'
      };

      renderWithProviders(
        <Button 
          variant="emergency"
          requireConfirmation
        >
          Secure Action
        </Button>,
        { securityContext }
      );

      const button = screen.getByTestId('crimeminer-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-live', 'assertive');
    });
  });
});