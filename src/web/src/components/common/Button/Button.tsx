import React, { useState, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.0
import { useTheme } from '@crimeminer/theme'; // v1.0.0
import styles from './Button.scss';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'emergency';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onEmergencyConfirm?: () => void;
  className?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  requireConfirmation?: boolean;
  nightModeEnabled?: boolean;
  touchFeedback?: 'none' | 'vibrate' | 'haptic';
  highContrast?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  type = 'button',
  onClick,
  onEmergencyConfirm,
  className,
  ariaLabel,
  icon,
  requireConfirmation = false,
  nightModeEnabled = false,
  touchFeedback = 'none',
  highContrast = false,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const { isDarkMode } = useTheme();

  // Handle touch feedback based on device capabilities
  const provideTouchFeedback = useCallback(() => {
    if (touchFeedback === 'vibrate' && navigator.vibrate) {
      navigator.vibrate(50);
    } else if (touchFeedback === 'haptic' && (window as any).navigator?.haptics) {
      (window as any).navigator.haptics.vibrate('medium');
    }
  }, [touchFeedback]);

  // Handle emergency confirmation flow
  const handleEmergencyClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    
    if (requireConfirmation && !isConfirming) {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000); // Reset after 3 seconds
      return;
    }

    if (onEmergencyConfirm) {
      onEmergencyConfirm();
    } else if (onClick) {
      onClick(event);
    }

    provideTouchFeedback();
    setIsConfirming(false);
  }, [isConfirming, requireConfirmation, onEmergencyConfirm, onClick, provideTouchFeedback]);

  // Handle regular click events
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (variant === 'emergency') {
      handleEmergencyClick(event);
      return;
    }

    if (onClick) {
      onClick(event);
      provideTouchFeedback();
    }
  }, [disabled, variant, handleEmergencyClick, onClick, provideTouchFeedback]);

  // Generate class names based on props and state
  const buttonClasses = classNames(
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    {
      [styles['button--disabled']]: disabled,
      [styles['button--night-mode']]: nightModeEnabled || isDarkMode,
      [styles['button--confirming']]: isConfirming,
      [styles['button--high-contrast']]: highContrast,
    },
    className
  );

  // Generate ARIA attributes for accessibility
  const ariaAttributes = {
    'aria-label': ariaLabel,
    'aria-disabled': disabled,
    'aria-busy': isConfirming,
    'aria-live': variant === 'emergency' ? 'assertive' : 'polite',
    'role': variant === 'emergency' ? 'alert' : undefined,
  };

  // Generate confirmation text for emergency actions
  const buttonText = isConfirming ? 'Confirm Emergency Action' : children;

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={handleClick}
      disabled={disabled}
      {...ariaAttributes}
      data-testid="crimeminer-button"
    >
      {icon && (
        <span className={styles.button__icon}>
          {icon}
        </span>
      )}
      {buttonText}
    </button>
  );
};

export default Button;