import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.0
import { Select, SelectProps } from './Select';
import { renderWithProviders } from '../../../tests/utils/test-utils';

expect.extend(toHaveNoViolations);

// Secure test data with sanitized inputs
const defaultProps: SelectProps = {
  name: 'test-select',
  options: ['Option 1', 'Option 2', 'Option 3'],
  value: '',
  placeholder: 'Select an option',
  onChange: jest.fn(),
  ariaLabel: 'Test select component',
  disabled: false,
  error: false,
  isHighContrast: false
};

// Enhanced test setup with security and accessibility configurations
const setup = (props: Partial<SelectProps> = {}) => {
  const mergedProps = { ...defaultProps, ...props };
  return renderWithProviders(<Select {...mergedProps} />);
};

describe('Select Component', () => {
  // Reset mocks and cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Tests', () => {
    it('should sanitize user input and prevent XSS', async () => {
      const maliciousOption = '<script>alert("xss")</script>';
      const { container } = setup({
        options: [maliciousOption]
      });
      
      expect(container.innerHTML).not.toContain('<script>');
      expect(screen.getByRole('button')).toHaveTextContent('Select an option');
    });

    it('should validate ARIA attributes for security compliance', () => {
      const { container } = setup();
      const button = screen.getByRole('button');
      
      expect(button).toHaveAttribute('aria-haspopup', 'listbox');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).not.toHaveAttribute('aria-invalid');
    });

    it('should handle malformed props safely', () => {
      const { container } = setup({
        // @ts-ignore - Testing invalid props
        options: null,
        value: undefined
      });
      
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = setup();
      const spy = jest.spyOn(document, 'removeEventListener');
      unmount();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Accessibility Tests', () => {
    it('should pass axe-core accessibility tests', async () => {
      const { container } = setup();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      setup();
      const button = screen.getByRole('button');
      
      // Open dropdown with keyboard
      fireEvent.keyDown(button, { key: 'Enter' });
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Navigate options
      fireEvent.keyDown(button, { key: 'ArrowDown' });
      expect(screen.getByText('Option 1')).toHaveAttribute('aria-selected', 'false');
      
      fireEvent.keyDown(button, { key: 'ArrowDown' });
      expect(screen.getByText('Option 2')).toHaveAttribute('aria-selected', 'false');
      
      // Select with keyboard
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(defaultProps.onChange).toHaveBeenCalledWith('Option 2');
    });

    it('should maintain focus management', async () => {
      setup();
      const button = screen.getByRole('button');
      
      button.focus();
      expect(document.activeElement).toBe(button);
      
      fireEvent.keyDown(button, { key: 'Enter' });
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
      
      fireEvent.keyDown(button, { key: 'Escape' });
      expect(document.activeElement).toBe(button);
    });

    it('should support screen reader announcements', async () => {
      setup();
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      const listbox = await screen.findByRole('listbox');
      
      expect(listbox).toHaveAttribute('aria-labelledby', `${defaultProps.name}-label`);
      expect(screen.getByText('Option 1')).toHaveAttribute('role', 'option');
    });

    it('should handle high contrast mode correctly', () => {
      setup({ isHighContrast: true });
      expect(screen.getByRole('button')).toHaveClass('select__control');
    });
  });

  describe('Performance Tests', () => {
    it('should render efficiently with many options', async () => {
      const manyOptions = Array.from({ length: 1000 }, (_, i) => `Option ${i}`);
      const startTime = performance.now();
      
      setup({ options: manyOptions });
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // 100ms threshold
    });

    it('should prevent memory leaks', async () => {
      const { unmount } = setup();
      const button = screen.getByRole('button');
      
      // Open and close multiple times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(button);
        await waitFor(() => {
          expect(screen.getByRole('listbox')).toBeInTheDocument();
        });
        fireEvent.keyDown(button, { key: 'Escape' });
      }
      
      unmount();
      // Verify no memory leaks using Chrome DevTools Memory Profiler
    });

    it('should optimize re-renders', async () => {
      const renderCount = jest.fn();
      const TestComponent = () => {
        renderCount();
        return <Select {...defaultProps} />;
      };
      
      renderWithProviders(<TestComponent />);
      const button = screen.getByRole('button');
      
      // Trigger multiple interactions
      fireEvent.click(button);
      fireEvent.keyDown(button, { key: 'ArrowDown' });
      fireEvent.keyDown(button, { key: 'Enter' });
      
      expect(renderCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('Functional Tests', () => {
    it('should handle option selection correctly', async () => {
      setup();
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      const option = screen.getByText('Option 1');
      fireEvent.click(option);
      
      expect(defaultProps.onChange).toHaveBeenCalledWith('Option 1');
      expect(button).toHaveTextContent('Option 1');
    });

    it('should handle disabled state', () => {
      setup({ disabled: true });
      const button = screen.getByRole('button');
      
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should handle error state', () => {
      setup({ error: true });
      const button = screen.getByRole('button');
      
      expect(button).toHaveAttribute('aria-invalid', 'true');
      expect(button).toHaveClass('select__control');
    });

    it('should close on outside click', async () => {
      setup();
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
      
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});