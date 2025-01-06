import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { THEME, TYPOGRAPHY } from '../../constants/ui.constants';

interface InputProps {
  id: string;
  name: string;
  type?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  label?: string;
  pattern?: string;
  allowCopy?: boolean;
  allowPaste?: boolean;
  sessionTimeout?: number;
  validationMessage?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onTimeout?: () => void;
  className?: string;
  ariaProps?: Record<string, string>;
}

const Input: React.FC<InputProps> = ({
  id,
  name,
  type = 'text',
  value,
  placeholder,
  disabled = false,
  required = false,
  error,
  label,
  pattern,
  allowCopy = true,
  allowPaste = true,
  sessionTimeout,
  validationMessage,
  onChange,
  onBlur,
  onFocus,
  onTimeout,
  className,
  ariaProps = {},
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Validate input against pattern
  const validateInput = (value: string): boolean => {
    if (!pattern) return true;
    const regex = new RegExp(pattern);
    return regex.test(value);
  };

  // Handle input change with validation and audit logging
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    const valid = validateInput(newValue);
    setIsValid(valid);
    
    // Audit log the input change
    console.info(`Input change - field: ${name}, valid: ${valid}`);
    
    onChange(event);
  };

  // Handle input focus with session timeout
  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    
    if (sessionTimeout && onTimeout) {
      timeoutRef.current = setTimeout(() => {
        onTimeout();
      }, sessionTimeout * 1000);
    }
    
    if (onFocus) {
      onFocus(event);
    }
    
    // Audit log the focus event
    console.info(`Input focus - field: ${name}`);
  };

  // Handle input blur with validation
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (onBlur) {
      onBlur(event);
    }
    
    // Audit log the blur event
    console.info(`Input blur - field: ${name}`);
  };

  // Handle copy/paste restrictions
  const handleCopy = (event: React.ClipboardEvent) => {
    if (!allowCopy) {
      event.preventDefault();
      console.warn(`Copy blocked - field: ${name}`);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    if (!allowPaste) {
      event.preventDefault();
      console.warn(`Paste blocked - field: ${name}`);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const inputStyles = {
    fontFamily: TYPOGRAPHY.FONT_FAMILY.PRIMARY,
    fontSize: TYPOGRAPHY.FONT_SIZE.MD,
    padding: '8px 12px',
    borderRadius: '4px',
    border: `1px solid ${error ? THEME.LIGHT.ERROR : THEME.LIGHT.BORDER}`,
    backgroundColor: disabled ? '#F5F5F5' : THEME.LIGHT.BACKGROUND,
    color: disabled ? '#757575' : THEME.LIGHT.TEXT,
    width: '100%',
    transition: 'border-color 0.2s ease-in-out',
    outline: 'none',
    '&:focus': {
      borderColor: THEME.LIGHT.PRIMARY,
      boxShadow: `0 0 0 2px ${THEME.LIGHT.PRIMARY}33`,
    },
    '&:focus-visible': {
      outline: `2px solid ${THEME.LIGHT.PRIMARY}`,
      outlineOffset: '2px',
    },
  };

  const labelStyles = {
    display: 'block',
    marginBottom: '4px',
    fontSize: TYPOGRAPHY.FONT_SIZE.SM,
    color: error ? THEME.LIGHT.ERROR : THEME.LIGHT.TEXT,
  };

  const errorStyles = {
    fontSize: TYPOGRAPHY.FONT_SIZE.SM,
    color: THEME.LIGHT.ERROR,
    marginTop: '4px',
  };

  return (
    <div className={classNames('input-container', className)}>
      {label && (
        <label 
          htmlFor={id}
          style={labelStyles}
        >
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        style={inputStyles}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onCopy={handleCopy}
        onPaste={handlePaste}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : undefined}
        {...ariaProps}
      />
      {error && (
        <div 
          id={`${id}-error`}
          role="alert"
          style={errorStyles}
        >
          {error}
        </div>
      )}
      {!isValid && validationMessage && (
        <div 
          role="alert"
          style={errorStyles}
        >
          {validationMessage}
        </div>
      )}
    </div>
  );
};

export default Input;