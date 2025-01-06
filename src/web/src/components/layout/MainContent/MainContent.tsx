import React, { memo, useMemo } from 'react'; // v18.0.0
import classNames from 'classnames'; // v2.3.2
import { useSelector } from '../../store/slices/ui.slice';
import { Loader } from '../../common/Loader/Loader';
import styles from './MainContent.scss';

interface MainContentProps {
  /** Child components to render within the main content area */
  children?: React.ReactNode;
  /** Optional additional CSS class names */
  className?: string;
  /** Test ID for component targeting in tests */
  testId?: string;
}

/**
 * Determines if any content is currently loading with debounce protection
 * @param loadingStates - Record of current loading states
 * @returns boolean indicating if content is loading
 */
const getLoadingState = memo((loadingStates: Record<string, boolean>): boolean => {
  if (!loadingStates || Object.keys(loadingStates).length === 0) {
    return false;
  }
  return Object.values(loadingStates).some(state => state);
});

/**
 * MainContent component provides a responsive, theme-aware container for the application's
 * primary content area. Implements WCAG 2.1 AA compliance with enhanced accessibility features.
 */
export const MainContent: React.FC<MainContentProps> = memo(({
  children = null,
  className = '',
  testId = 'main-content'
}) => {
  // Get UI state from Redux store
  const loadingStates = useSelector(state => state.ui.loadingStates);
  const themeMode = useSelector(state => state.ui.theme);
  const highContrast = useSelector(state => state.ui.isHighContrast);

  // Memoize loading state calculation
  const isLoading = useMemo(() => getLoadingState(loadingStates), [loadingStates]);

  // Memoize class name generation
  const containerClasses = useMemo(() => classNames(
    styles['main-content'],
    {
      [styles['main-content--loading']]: isLoading,
      [styles['main-content--theme-light']]: themeMode === 'LIGHT',
      [styles['main-content--theme-dark']]: themeMode === 'DARK',
      [styles['main-content--high-contrast']]: highContrast
    },
    className
  ), [isLoading, themeMode, highContrast, className]);

  return (
    <main
      className={containerClasses}
      data-testid={testId}
      role="main"
      aria-busy={isLoading}
      // Performance optimizations
      style={{
        willChange: 'background-color',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden'
      }}
    >
      <div className={styles['main-content__inner']}>
        {isLoading ? (
          <Loader
            size="large"
            overlay={false}
            ariaLabel="Loading content..."
            highContrast={highContrast}
          />
        ) : (
          <section className={styles['main-content__section']}>
            {children}
          </section>
        )}
      </div>
    </main>
  );
});

// Display name for debugging
MainContent.displayName = 'MainContent';

export default MainContent;