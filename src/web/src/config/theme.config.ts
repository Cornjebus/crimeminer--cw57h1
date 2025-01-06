import { create } from '@emotion/react';
import { $colors, $typography } from '../assets/styles/variables';

// Theme mode enumeration
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  HIGH_CONTRAST = 'high-contrast'
}

// Color scheme enumeration
export enum ColorScheme {
  NORMAL = 'normal',
  COLOR_BLIND = 'color-blind'
}

// Theme configuration interface
export interface ThemeConfig {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
    error: string;
    warning: string;
    border: string;
  };
  typography: {
    fontFamily: {
      primary: string;
      monospace: string;
    };
    fontSize: {
      base: string;
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      '2xl': string;
      '3xl': string;
      '4xl': string;
    };
    fontWeight: {
      regular: number;
      medium: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };
}

// Default theme configurations
export const defaultTheme: Record<ThemeMode, ThemeConfig> = {
  [ThemeMode.LIGHT]: {
    mode: ThemeMode.LIGHT,
    colorScheme: ColorScheme.NORMAL,
    colors: {
      background: $colors.background.light,
      text: $colors.text.light,
      primary: $colors.primary,
      secondary: $colors.secondary,
      error: $colors.error,
      warning: $colors.warning,
      border: $colors.border
    },
    typography: $typography
  },
  [ThemeMode.DARK]: {
    mode: ThemeMode.DARK,
    colorScheme: ColorScheme.NORMAL,
    colors: {
      background: $colors.background.dark,
      text: $colors.text.dark,
      primary: '#4285F4', // Adjusted for dark mode visibility
      secondary: '#34A853',
      error: '#FF6B6B',
      warning: '#FFC107',
      border: '#404040'
    },
    typography: $typography
  },
  [ThemeMode.HIGH_CONTRAST]: {
    mode: ThemeMode.HIGH_CONTRAST,
    colorScheme: ColorScheme.NORMAL,
    colors: {
      background: '#000000',
      text: '#FFFFFF',
      primary: '#FFFF00',
      secondary: '#00FF00',
      error: '#FF0000',
      warning: '#FFA500',
      border: '#FFFFFF'
    },
    typography: {
      ...$typography,
      fontSize: {
        ...$typography.fontSize,
        base: '18px' // Increased base size for better readability
      }
    }
  }
};

// Color-blind friendly palette adjustments
const colorBlindPalette = {
  primary: '#0077BB', // Blue - distinguishable for protanopia/deuteranopia
  secondary: '#EE7733', // Orange - distinguishable for tritanopia
  error: '#EE3377', // Magenta - distinguishable for all types
  warning: '#009988' // Teal - distinguishable for all types
};

/**
 * Validates color combinations against WCAG 2.1 AA standards
 */
export function validateWCAGContrast(colors: ThemeConfig['colors']): boolean {
  const getLuminance = (hexColor: string): number => {
    const rgb = parseInt(hexColor.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;
    
    const [lr, lg, lb] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };

  const getContrastRatio = (l1: number, l2: number): number => {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // WCAG AA minimum contrast ratios
  const MIN_CONTRAST_NORMAL = 4.5;
  const MIN_CONTRAST_LARGE = 3;

  const backgroundLuminance = getLuminance(colors.background);
  const textLuminance = getLuminance(colors.text);
  const primaryLuminance = getLuminance(colors.primary);

  // Validate text contrast
  const textContrast = getContrastRatio(backgroundLuminance, textLuminance);
  if (textContrast < MIN_CONTRAST_NORMAL) return false;

  // Validate primary interactive elements
  const primaryContrast = getContrastRatio(backgroundLuminance, primaryLuminance);
  if (primaryContrast < MIN_CONTRAST_LARGE) return false;

  return true;
}

/**
 * Retrieves initial theme preference with system preference detection
 */
export function getInitialTheme(): ThemeConfig {
  // Check local storage
  const savedTheme = localStorage.getItem('theme-preference');
  if (savedTheme) {
    return JSON.parse(savedTheme);
  }

  // Check system preferences
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersHighContrast = window.matchMedia('(prefers-contrast: more)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersHighContrast) {
    return defaultTheme[ThemeMode.HIGH_CONTRAST];
  }

  return defaultTheme[prefersDark ? ThemeMode.DARK : ThemeMode.LIGHT];
}

/**
 * Applies theme with WCAG validation and accessibility checks
 */
export function applyTheme(config: ThemeConfig): void {
  // Validate WCAG contrast
  if (!validateWCAGContrast(config.colors)) {
    console.warn('Theme colors do not meet WCAG AA contrast requirements');
    // Fall back to high contrast if validation fails
    config = defaultTheme[ThemeMode.HIGH_CONTRAST];
  }

  // Apply color-blind adjustments if needed
  if (config.colorScheme === ColorScheme.COLOR_BLIND) {
    config.colors = {
      ...config.colors,
      ...colorBlindPalette
    };
  }

  // Generate CSS custom properties
  const cssVars = {
    '--background-color': config.colors.background,
    '--text-color': config.colors.text,
    '--primary-color': config.colors.primary,
    '--secondary-color': config.colors.secondary,
    '--error-color': config.colors.error,
    '--warning-color': config.colors.warning,
    '--border-color': config.colors.border,
    '--font-family-primary': config.typography.fontFamily.primary,
    '--font-family-monospace': config.typography.fontFamily.monospace,
    '--font-size-base': config.typography.fontSize.base
  };

  // Apply to document root
  const root = document.documentElement;
  Object.entries(cssVars).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  // Set theme metadata
  document.documentElement.setAttribute('data-theme', config.mode);
  document.documentElement.setAttribute('data-color-scheme', config.colorScheme);

  // Persist preference
  localStorage.setItem('theme-preference', JSON.stringify(config));

  // Emit theme change event for analytics
  window.dispatchEvent(new CustomEvent('themechange', { detail: config }));
}

// Create theme context
export const ThemeContext = create({
  theme: getInitialTheme(),
  toggleTheme: (mode: ThemeMode) => {},
  toggleColorScheme: (scheme: ColorScheme) => {}
});