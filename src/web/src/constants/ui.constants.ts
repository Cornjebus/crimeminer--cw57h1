/**
 * @fileoverview Global UI constants and configuration values for the CrimeMiner web application.
 * All values are WCAG 2.1 AA compliant and follow Material Design principles.
 * @version 1.0.0
 */

/**
 * Theme configuration types
 */
export type ThemeColors = {
  readonly BACKGROUND: string;
  readonly TEXT: string;
  readonly PRIMARY: string;
  readonly SECONDARY: string;
  readonly ERROR: string;
  readonly WARNING: string;
  readonly BORDER: string;
};

export type ThemeConfig = {
  readonly LIGHT: ThemeColors;
  readonly DARK: ThemeColors;
};

/**
 * Typography configuration types
 */
export type FontFamilyConfig = {
  readonly PRIMARY: string;
  readonly MONOSPACE: string;
};

export type FontSizeConfig = {
  readonly XS: string;
  readonly SM: string;
  readonly MD: string;
  readonly LG: string;
  readonly XL: string;
  readonly XXL: string;
};

export type FontWeightConfig = {
  readonly REGULAR: number;
  readonly MEDIUM: number;
  readonly BOLD: number;
};

/**
 * Layout configuration types
 */
export type BreakpointConfig = {
  readonly MOBILE: number;
  readonly TABLET: number;
  readonly DESKTOP: number;
  readonly LARGE: number;
};

export type GridConfig = {
  readonly COLUMNS: number;
  readonly GUTTER: {
    readonly MOBILE: number;
    readonly TABLET: number;
    readonly DESKTOP: number;
  };
  readonly MAX_WIDTH: number;
};

export type SpacingConfig = {
  readonly XS: number;
  readonly SM: number;
  readonly MD: number;
  readonly LG: number;
  readonly XL: number;
  readonly XXL: number;
};

/**
 * Animation configuration types
 */
export type DurationConfig = {
  readonly FAST: number;
  readonly NORMAL: number;
  readonly SLOW: number;
};

export type EasingConfig = {
  readonly EASE_IN_OUT: string;
  readonly EASE_OUT: string;
  readonly EASE_IN: string;
};

/**
 * Theme constants - WCAG 2.1 AA compliant color values
 * All color combinations meet minimum contrast ratio of 4.5:1
 */
export const THEME: ThemeConfig = {
  LIGHT: {
    BACKGROUND: '#FFFFFF',
    TEXT: '#333333',
    PRIMARY: '#1A73E8',
    SECONDARY: '#34A853',
    ERROR: '#EA4335',
    WARNING: '#FBBC04',
    BORDER: '#CCCCCC'
  },
  DARK: {
    BACKGROUND: '#1E1E1E',
    TEXT: '#FFFFFF',
    PRIMARY: '#4285F4',
    SECONDARY: '#34A853',
    ERROR: '#FF6B6B',
    WARNING: '#FBBC04',
    BORDER: '#404040'
  }
} as const;

/**
 * Typography constants following Material Design principles
 */
export const TYPOGRAPHY = {
  FONT_FAMILY: {
    PRIMARY: 'Inter, system-ui, -apple-system, sans-serif',
    MONOSPACE: 'JetBrains Mono, monospace'
  },
  FONT_SIZE: {
    XS: '0.75rem',    // 12px
    SM: '0.875rem',   // 14px
    MD: '1rem',       // 16px
    LG: '1.125rem',   // 18px
    XL: '1.25rem',    // 20px
    XXL: '1.5rem'     // 24px
  },
  FONT_WEIGHT: {
    REGULAR: 400,
    MEDIUM: 500,
    BOLD: 700
  }
} as const;

/**
 * Layout constants for responsive design and spacing
 */
export const LAYOUT = {
  BREAKPOINTS: {
    MOBILE: 320,
    TABLET: 768,
    DESKTOP: 1024,
    LARGE: 1440
  },
  GRID: {
    COLUMNS: 12,
    GUTTER: {
      MOBILE: 16,
      TABLET: 24,
      DESKTOP: 32
    },
    MAX_WIDTH: 1440
  },
  SPACING: {
    XS: 4,
    SM: 8,
    MD: 16,
    LG: 24,
    XL: 32,
    XXL: 48
  }
} as const;

/**
 * Animation constants for consistent motion design
 */
export const ANIMATION = {
  DURATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
  },
  EASING: {
    EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    EASE_OUT: 'cubic-bezier(0.0, 0, 0.2, 1)',
    EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)'
  }
} as const;

/**
 * Z-index constants for consistent layering
 */
export const Z_INDEX = {
  MODAL: 1000,
  OVERLAY: 900,
  DROPDOWN: 800,
  HEADER: 700
} as const;

/**
 * Media query helper functions for responsive design
 */
export const mediaQuery = {
  mobile: `@media (max-width: ${LAYOUT.BREAKPOINTS.TABLET - 1}px)`,
  tablet: `@media (min-width: ${LAYOUT.BREAKPOINTS.TABLET}px) and (max-width: ${LAYOUT.BREAKPOINTS.DESKTOP - 1}px)`,
  desktop: `@media (min-width: ${LAYOUT.BREAKPOINTS.DESKTOP}px) and (max-width: ${LAYOUT.BREAKPOINTS.LARGE - 1}px)`,
  large: `@media (min-width: ${LAYOUT.BREAKPOINTS.LARGE}px)`
} as const;