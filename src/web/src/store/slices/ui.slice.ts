/**
 * @fileoverview Redux slice for managing global UI state in the CrimeMiner web application.
 * Handles theme settings, layout configurations, loading states, modal/alert management,
 * and accessibility features with WCAG 2.1 AA compliance.
 * @version 1.0.0
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { THEME, LAYOUT } from '../../constants/ui.constants';

// Types
export type ThemeType = keyof typeof THEME;
export type BreakpointType = keyof typeof LAYOUT.BREAKPOINTS;
export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type TextSize = 'small' | 'normal' | 'large' | 'x-large';

export interface AccessibilityConfig {
  screenReaderOptimized: boolean;
  reducedMotion: boolean;
  keyboardNavigation: boolean;
  colorBlindMode: ColorBlindMode;
  textSize: TextSize;
  highContrast: boolean;
}

export interface AlertConfig {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface UIState {
  theme: ThemeType;
  isHighContrast: boolean;
  textSize: TextSize;
  isSidebarOpen: boolean;
  activeModal: string | null;
  alerts: AlertConfig[];
  loadingStates: Record<string, boolean>;
  breakpoint: BreakpointType;
  accessibility: AccessibilityConfig;
}

// Initial state
const initialState: UIState = {
  theme: 'LIGHT',
  isHighContrast: false,
  textSize: 'normal',
  isSidebarOpen: true,
  activeModal: null,
  alerts: [],
  loadingStates: {},
  breakpoint: 'DESKTOP',
  accessibility: {
    screenReaderOptimized: false,
    reducedMotion: false,
    keyboardNavigation: true,
    colorBlindMode: 'none',
    textSize: 'normal',
    highContrast: false
  }
};

// Create slice
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeType>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },

    toggleHighContrast: (state) => {
      state.isHighContrast = !state.isHighContrast;
      localStorage.setItem('highContrast', String(state.isHighContrast));
    },

    setTextSize: (state, action: PayloadAction<TextSize>) => {
      state.textSize = action.payload;
      state.accessibility.textSize = action.payload;
      localStorage.setItem('textSize', action.payload);
    },

    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },

    setModal: (state, action: PayloadAction<string | null>) => {
      state.activeModal = action.payload;
    },

    addAlert: (state, action: PayloadAction<AlertConfig>) => {
      state.alerts.push(action.payload);
    },

    removeAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter(alert => alert.id !== action.payload);
    },

    setLoading: (state, action: PayloadAction<{ key: string; isLoading: boolean }>) => {
      state.loadingStates[action.payload.key] = action.payload.isLoading;
    },

    setBreakpoint: (state, action: PayloadAction<BreakpointType>) => {
      state.breakpoint = action.payload;
    },

    updateAccessibilityPreferences: (state, action: PayloadAction<Partial<AccessibilityConfig>>) => {
      state.accessibility = {
        ...state.accessibility,
        ...action.payload
      };
      localStorage.setItem('accessibility', JSON.stringify(state.accessibility));
    },

    resetUI: () => initialState
  },
});

// Selectors
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectIsHighContrast = (state: { ui: UIState }) => state.ui.isHighContrast;
export const selectTextSize = (state: { ui: UIState }) => state.ui.textSize;
export const selectIsSidebarOpen = (state: { ui: UIState }) => state.ui.isSidebarOpen;
export const selectActiveModal = (state: { ui: UIState }) => state.ui.activeModal;
export const selectAlerts = (state: { ui: UIState }) => state.ui.alerts;
export const selectLoadingState = (state: { ui: UIState }, key: string) => state.ui.loadingStates[key] || false;
export const selectBreakpoint = (state: { ui: UIState }) => state.ui.breakpoint;
export const selectAccessibility = (state: { ui: UIState }) => state.ui.accessibility;

// Export actions and reducer
export const {
  setTheme,
  toggleHighContrast,
  setTextSize,
  toggleSidebar,
  setModal,
  addAlert,
  removeAlert,
  setLoading,
  setBreakpoint,
  updateAccessibilityPreferences,
  resetUI
} = uiSlice.actions;

export default uiSlice.reducer;