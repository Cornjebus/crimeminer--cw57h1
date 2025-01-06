import React, { useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.2
import styles from './Alert.scss';

// Alert component props interface
interface AlertProps {
  /** Content to be displayed within the alert */
  children: React.ReactNode;
  /** Determines the alert variant and associated styling */
  type?: 'success' | 'error' | 'warning' | 'info';
  /** Controls whether the alert can be dismissed */
  dismissible?: boolean;
  /** Optional callback function called when alert is dismissed */
  onDismiss?: () => void;
  /** Optional additional CSS classes */
  className?: string;
  /** ARIA role for accessibility */
  role?: 'alert' | 'status' | 'log';
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Controls RTL layout support */
  isRTL?: boolean;
}

/**
 * Alert component for displaying contextual feedback messages
 * Supports multiple variants, themes, and RTL layouts
 * WCAG 2.1 AA compliant with full screen reader support
 */
const Alert: React.FC<AlertProps> = ({
  children,
  type = 'info',
  dismissible = false,
  onDismiss,
  className = '',
  role = 'alert',
  ariaLabel,
  isRTL = false
}) => {
  const alertRef = useRef<HTMLDivElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);

  // Handle cleanup of event listeners
  useEffect(() => {
    const alertElement = alertRef.current;
    if (!alertElement || !dismissible) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onDismiss) {
        onDismiss();
      }
    };

    alertElement.addEventListener('keydown', handleEscapeKey);
    return () => {
      alertElement.removeEventListener('keydown', handleEscapeKey);
    };
  }, [dismissible, onDismiss]);

  // Handle dismiss action with keyboard support
  const handleDismiss = useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    onDismiss?.();
  }, [onDismiss]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!dismissible) return;

    switch (event.key) {
      case 'Tab':
        // Keep focus within the alert when dismissible
        if (event.shiftKey && document.activeElement === alertRef.current) {
          event.preventDefault();
          dismissButtonRef.current?.focus();
        }
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Support RTL navigation
        if (isRTL ? event.key === 'ArrowLeft' : event.key === 'ArrowRight') {
          dismissButtonRef.current?.focus();
        }
        break;
    }
  }, [dismissible, isRTL]);

  // Combine class names for styling
  const alertClasses = classNames(
    styles.alert,
    styles[`alert--${type}`],
    {
      [styles['alert--rtl']]: isRTL
    },
    className
  );

  return (
    <div
      ref={alertRef}
      className={alertClasses}
      role={role}
      aria-label={ariaLabel}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      dir={isRTL ? 'rtl' : 'ltr'}
      onKeyDown={handleKeyDown}
      tabIndex={dismissible ? 0 : undefined}
    >
      {/* Alert icon based on type */}
      <span className={styles.alert__icon} aria-hidden="true">
        {type === 'success' && '✓'}
        {type === 'error' && '✕'}
        {type === 'warning' && '⚠'}
        {type === 'info' && 'ℹ'}
      </span>

      {/* Alert content */}
      <div className={styles.alert__content}>
        {children}
      </div>

      {/* Dismissible button */}
      {dismissible && (
        <button
          ref={dismissButtonRef}
          type="button"
          className={styles.alert__close}
          onClick={handleDismiss}
          onKeyDown={handleDismiss}
          aria-label="Close alert"
          tabIndex={0}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
};

export default Alert;