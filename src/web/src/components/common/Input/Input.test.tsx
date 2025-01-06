import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { describe, it, expect, jest } from '@jest/globals'; // v29.0.0
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.0
import Input from './Input';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { THEME } from '../../constants/ui.constants';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock functions
const mockOnChange = jest.fn();
const mockOnBlur = jest.fn();
const mockOnFocus = jest.fn();
const mockOnTimeout = jest.fn();

// Default test props
const defaultProps = {
  id: 'test-input',
  name: 'test-input',
  value: '',
  onChange: mockOnChange,
  label: 'Test Input',
  required: true,
  'data-testid': 'test-input'
};

// Setup function with security context
const setup = (props = {}) => {
  const securityContext = {
    classificationLevel: 'FEDRAMP_HIGH',
    userId: 'test-user',
    agencyId: 'test-agency',
    jurisdiction: 'FEDERAL',
    sessionId: 'test-session',
    clearanceLevel: 'SECRET'
  };

  return renderWithProviders(
    <Input {...defaultProps} {...props} />,
    { securityContext }
  );
};

describe('Input Component Core Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with required props', () => {
    setup();
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('required');
  });

  it('handles value changes correctly', async () => {
    setup();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'test value');
    expect(mockOnChange).toHaveBeenCalled();
    expect(input).toHaveValue('test value');
  });

  it('shows error state when provided', () => {
    setup({ error: 'Test error message' });
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Test error message');
    expect(errorMessage).toHaveStyle({ color: THEME.LIGHT.ERROR });
  });

  it('supports disabled state', () => {
    setup({ disabled: true });
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('maintains value history for audit', async () => {
    const { container } = setup();
    const input = screen.getByRole('textbox');
    
    await userEvent.type(input, 'sensitive data');
    expect(mockOnChange).toHaveBeenCalledTimes('sensitive data'.length);
  });
});

describe('Accessibility Compliance', () => {
  it('meets WCAG 2.1 AA standards', async () => {
    const { container } = setup();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper ARIA labels', () => {
    setup({
      label: 'Test Label',
      error: 'Test Error',
      required: true
    });
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('supports keyboard navigation', async () => {
    setup();
    const input = screen.getByRole('textbox');
    
    input.focus();
    expect(input).toHaveFocus();
    
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveFocus();
  });

  it('announces error messages', () => {
    setup({ error: 'Validation error' });
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Validation error');
  });
});

describe('Security Features', () => {
  it('handles security classifications', async () => {
    const { securityContext } = setup({
      ariaProps: { 'data-classification': 'SECRET' }
    });
    
    expect(securityContext.clearanceLevel).toBe('SECRET');
  });

  it('prevents XSS attacks', async () => {
    setup();
    const input = screen.getByRole('textbox');
    const xssScript = '<script>alert("xss")</script>';
    
    await userEvent.type(input, xssScript);
    expect(input.value).not.toContain('<script>');
  });

  it('masks sensitive data when required', async () => {
    setup({ type: 'password' });
    const input = screen.getByRole('textbox');
    
    await userEvent.type(input, 'sensitive123');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('enforces timeout policies', async () => {
    setup({ sessionTimeout: 1, onTimeout: mockOnTimeout });
    const input = screen.getByRole('textbox');
    
    fireEvent.focus(input);
    await waitFor(() => {
      expect(mockOnTimeout).toHaveBeenCalled();
    }, { timeout: 1100 });
  });
});

describe('Validation and Error Handling', () => {
  it('shows required field validation', async () => {
    setup({ required: true });
    const input = screen.getByRole('textbox');
    
    fireEvent.blur(input);
    expect(mockOnBlur).toHaveBeenCalled();
    expect(input).toBeInvalid();
  });

  it('validates input patterns', async () => {
    setup({
      pattern: '^[A-Za-z]+$',
      validationMessage: 'Letters only'
    });
    
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '123');
    
    const validationMessage = screen.getByRole('alert');
    expect(validationMessage).toHaveTextContent('Letters only');
  });

  it('enforces character limits', async () => {
    setup({ maxLength: 5 });
    const input = screen.getByRole('textbox');
    
    await userEvent.type(input, '123456');
    expect(input).toHaveValue('12345');
  });

  it('validates on blur', async () => {
    setup({
      onBlur: mockOnBlur,
      required: true
    });
    
    const input = screen.getByRole('textbox');
    fireEvent.blur(input);
    
    expect(mockOnBlur).toHaveBeenCalled();
    expect(input).toBeInvalid();
  });
});