import React, { memo, useMemo } from 'react'; // v18.0.0
import classNames from 'classnames'; // v2.3.2
import styles from './Loader.scss';

// Type definitions for component props
type LoaderSize = 'small' | 'medium' | 'large';

interface LoaderProps {
  /** Size variant of the loader */
  size?: LoaderSize;
  /** Whether to display loader in full-screen overlay mode */
  overlay?: boolean;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Additional CSS class names */
  className?: string;
  /** Whether to enable reduced motion mode */
  reducedMotion?: boolean;
  /** Whether to enable high contrast mode */
  highContrast?: boolean;
}

// Size class mapping utility
const getSizeClass = memo((size: LoaderSize): string => {
  switch (size) {
    case 'small':
      return styles['loader--small'];
    case 'large':
      return styles['loader--large'];
    case 'medium':
      return '';
    default:
      return '';
  }
});

/**
 * A highly accessible, performance-optimized loading spinner component
 * that provides visual feedback during loading states.
 */
export const Loader: React.FC<LoaderProps> = memo(({
  size = 'medium',
  overlay = false,
  ariaLabel = 'Loading...',
  className,
  reducedMotion = false,
  highContrast = false
}) => {
  // Memoize class name generation for performance
  const loaderClasses = useMemo(() => classNames(
    styles.loader,
    getSizeClass(size),
    {
      [styles['loader__overlay']]: overlay,
      [styles['loader--reduced-motion']]: reducedMotion,
      [styles['loader--high-contrast']]: highContrast
    },
    className
  ), [size, overlay, reducedMotion, highContrast, className]);

  // Memoize spinner classes for performance
  const spinnerClasses = useMemo(() => classNames(
    styles.loader__spinner,
    {
      [styles['loader--reduced-motion']]: reducedMotion,
      [styles['loader--high-contrast']]: highContrast
    }
  ), [reducedMotion, highContrast]);

  const LoaderContent = (
    <div
      className={loaderClasses}
      role="progressbar"
      aria-label={ariaLabel}
      aria-busy="true"
      aria-live="polite"
      // Performance optimizations
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden'
      }}
    >
      <div 
        className={spinnerClasses}
        // Prevent layout shifts during animation
        style={{ contain: 'layout' }}
      />
      <span className={styles.loader__text}>
        {ariaLabel}
      </span>
    </div>
  );

  // Render with or without overlay
  if (overlay) {
    return (
      <div 
        className={styles.loader__overlay}
        role="dialog"
        aria-modal="true"
        // Trap focus within overlay
        tabIndex={-1}
      >
        {LoaderContent}
      </div>
    );
  }

  return LoaderContent;
});

// Display name for debugging
Loader.displayName = 'Loader';

// Default props
Loader.defaultProps = {
  size: 'medium',
  overlay: false,
  ariaLabel: 'Loading...',
  reducedMotion: false,
  highContrast: false
};

export default Loader;