/**
 * Settings page component implementing FedRAMP High and CJIS compliant user preferences,
 * accessibility options, and system configurations with comprehensive audit logging.
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.1
import { useAuth } from '../../hooks/useAuth';
import {
  setTheme,
  toggleHighContrast,
  setTextSize,
  updateAccessibilityPreferences,
  selectTheme,
  selectAccessibility,
  ThemeType,
  ColorBlindMode,
  TextSize,
  AccessibilityConfig
} from '../../store/slices/ui.slice';
import { auditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { THEME, TYPOGRAPHY, LAYOUT } from '../../constants/ui.constants';

// Security levels for settings
const SECURITY_LEVELS = {
  HIGH: 'FEDRAMP_HIGH',
  CJIS: 'CJIS_COMPLIANT',
  STANDARD: 'STANDARD'
} as const;

// Settings sections with security levels
const SETTINGS_SECTIONS = {
  APPEARANCE: {
    id: 'appearance',
    label: 'Appearance Settings',
    security: SECURITY_LEVELS.STANDARD
  },
  ACCESSIBILITY: {
    id: 'accessibility',
    label: 'Accessibility Options',
    security: SECURITY_LEVELS.HIGH
  },
  SECURITY: {
    id: 'security',
    label: 'Security Preferences',
    security: SECURITY_LEVELS.CJIS
  }
} as const;

/**
 * Enhanced settings page component with security validation and audit logging
 */
const Settings: React.FC = () => {
  const dispatch = useDispatch();
  const { user, validateSecurityContext } = useAuth();
  
  // Local state for form handling
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get current settings from Redux
  const currentTheme = useSelector(selectTheme);
  const accessibility = useSelector(selectAccessibility);

  // Validate security context on mount
  useEffect(() => {
    const validateSecurity = async () => {
      try {
        await validateSecurityContext();
      } catch (error) {
        setError('Security validation failed');
      }
    };
    validateSecurity();
  }, [validateSecurityContext]);

  /**
   * Handles secure setting changes with audit logging
   */
  const handleSecureSettingChange = async (
    settingType: string,
    value: any,
    securityLevel: string
  ) => {
    try {
      setLoading(true);
      setError(null);

      // Validate security context for sensitive settings
      if (securityLevel === SECURITY_LEVELS.CJIS) {
        await validateSecurityContext();
      }

      // Generate audit context
      const auditContext = {
        userId: user?.id,
        action: 'SETTING_UPDATE',
        setting: settingType,
        oldValue: settingType === 'theme' ? currentTheme : accessibility[settingType],
        newValue: value,
        timestamp: new Date(),
        securityLevel
      };

      // Dispatch appropriate action based on setting type
      switch (settingType) {
        case 'theme':
          dispatch(setTheme(value as ThemeType));
          break;
        case 'highContrast':
          dispatch(toggleHighContrast());
          break;
        case 'colorBlindMode':
          dispatch(updateAccessibilityPreferences({ colorBlindMode: value as ColorBlindMode }));
          break;
        case 'textSize':
          dispatch(setTextSize(value as TextSize));
          break;
        default:
          dispatch(updateAccessibilityPreferences({ [settingType]: value }));
      }

      // Log setting change
      await auditLogger.logSettingChange(auditContext);

    } catch (error: any) {
      setError(error.message);
      auditLogger.logSecurityEvent({
        type: 'SETTING_UPDATE_FAILED',
        error: error.message,
        context: { settingType, securityLevel }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-container" role="main" aria-label="Settings Page">
      {error && (
        <div className="error-banner" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <section aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">{SETTINGS_SECTIONS.APPEARANCE.label}</h2>
        
        <div className="setting-group">
          <label htmlFor="theme-select">Theme</label>
          <select
            id="theme-select"
            value={currentTheme}
            onChange={(e) => handleSecureSettingChange(
              'theme',
              e.target.value,
              SETTINGS_SECTIONS.APPEARANCE.security
            )}
            disabled={loading}
          >
            <option value="LIGHT">Light</option>
            <option value="DARK">Dark</option>
          </select>
        </div>
      </section>

      <section aria-labelledby="accessibility-heading">
        <h2 id="accessibility-heading">{SETTINGS_SECTIONS.ACCESSIBILITY.label}</h2>
        
        <div className="setting-group">
          <label htmlFor="high-contrast">
            <input
              type="checkbox"
              id="high-contrast"
              checked={accessibility.highContrast}
              onChange={() => handleSecureSettingChange(
                'highContrast',
                !accessibility.highContrast,
                SETTINGS_SECTIONS.ACCESSIBILITY.security
              )}
              disabled={loading}
            />
            High Contrast Mode
          </label>
        </div>

        <div className="setting-group">
          <label htmlFor="color-blind-mode">Color Blind Mode</label>
          <select
            id="color-blind-mode"
            value={accessibility.colorBlindMode}
            onChange={(e) => handleSecureSettingChange(
              'colorBlindMode',
              e.target.value,
              SETTINGS_SECTIONS.ACCESSIBILITY.security
            )}
            disabled={loading}
          >
            <option value="none">None</option>
            <option value="protanopia">Protanopia</option>
            <option value="deuteranopia">Deuteranopia</option>
            <option value="tritanopia">Tritanopia</option>
          </select>
        </div>

        <div className="setting-group">
          <label htmlFor="text-size">Text Size</label>
          <select
            id="text-size"
            value={accessibility.textSize}
            onChange={(e) => handleSecureSettingChange(
              'textSize',
              e.target.value,
              SETTINGS_SECTIONS.ACCESSIBILITY.security
            )}
            disabled={loading}
          >
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="x-large">Extra Large</option>
          </select>
        </div>

        <div className="setting-group">
          <label htmlFor="screen-reader">
            <input
              type="checkbox"
              id="screen-reader"
              checked={accessibility.screenReaderOptimized}
              onChange={() => handleSecureSettingChange(
                'screenReaderOptimized',
                !accessibility.screenReaderOptimized,
                SETTINGS_SECTIONS.ACCESSIBILITY.security
              )}
              disabled={loading}
            />
            Screen Reader Optimized
          </label>
        </div>

        <div className="setting-group">
          <label htmlFor="reduced-motion">
            <input
              type="checkbox"
              id="reduced-motion"
              checked={accessibility.reducedMotion}
              onChange={() => handleSecureSettingChange(
                'reducedMotion',
                !accessibility.reducedMotion,
                SETTINGS_SECTIONS.ACCESSIBILITY.security
              )}
              disabled={loading}
            />
            Reduced Motion
          </label>
        </div>
      </section>

      <section aria-labelledby="security-heading">
        <h2 id="security-heading">{SETTINGS_SECTIONS.SECURITY.label}</h2>
        
        <div className="setting-group">
          <label htmlFor="keyboard-nav">
            <input
              type="checkbox"
              id="keyboard-nav"
              checked={accessibility.keyboardNavigation}
              onChange={() => handleSecureSettingChange(
                'keyboardNavigation',
                !accessibility.keyboardNavigation,
                SETTINGS_SECTIONS.SECURITY.security
              )}
              disabled={loading}
            />
            Enhanced Keyboard Navigation
          </label>
        </div>
      </section>
    </div>
  );
};

export default Settings;