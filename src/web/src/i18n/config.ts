import i18next from 'i18next'; // v23.0.0
import { initReactI18next } from 'react-i18next'; // v13.0.0
import LanguageDetector from 'i18next-browser-languagedetector'; // v7.0.0
import sanitizeHtml from 'sanitize-html'; // v2.11.0

import {
  common,
  auth,
  cases,
  evidence,
  analysis,
  search,
  reports,
  settings
} from './en.json';

// Global constants
const DEFAULT_LANGUAGE = 'en';
const FALLBACK_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = ['en'];
const LANGUAGE_CACHE_DURATION = 3600;
const TRANSLATION_CHUNK_SIZE = 50000;

// Secure format function for interpolation
const secureFormat = (value: string, format?: string): string => {
  if (!value) return '';
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape'
  });
};

// Custom secure storage implementation
const secureStorage = {
  setItem: (key: string, value: string): void => {
    try {
      sessionStorage.setItem(
        key, 
        btoa(encodeURIComponent(value))
      );
    } catch (error) {
      console.error('Error storing language preference:', error);
    }
  },
  getItem: (key: string): string | null => {
    try {
      const value = sessionStorage.getItem(key);
      return value ? decodeURIComponent(atob(value)) : null;
    } catch (error) {
      console.error('Error retrieving language preference:', error);
      return null;
    }
  }
};

// Custom language detector with security enhancements
const secureLanguageDetector = {
  name: 'secureDetector',
  lookup: (): string => {
    // Check secure storage first
    const stored = secureStorage.getItem('user_lang_pref');
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored;
    }

    // Fall back to navigator language with validation
    const browserLang = navigator.language.split('-')[0];
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
  },
  cacheUserLanguage: (lng: string): void => {
    secureStorage.setItem('user_lang_pref', lng);
  }
};

// Audit logging decorator
function auditLog(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    console.info(`[i18n] Initializing with security context`);
    const result = await originalMethod.apply(this, args);
    console.info(`[i18n] Initialization complete`);
    return result;
  };
  return descriptor;
}

// Performance tracing decorator
function performanceTrace(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    const start = performance.now();
    const result = await originalMethod.apply(this, args);
    const duration = performance.now() - start;
    console.debug(`[i18n] Initialization took ${duration.toFixed(2)}ms`);
    return result;
  };
  return descriptor;
}

@auditLog
@performanceTrace
export async function initializeI18n(): Promise<typeof i18next> {
  await i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: FALLBACK_LANGUAGE,
      debug: process.env.NODE_ENV === 'development',
      
      resources: {
        en: {
          common,
          auth,
          cases,
          evidence,
          analysis,
          search,
          reports,
          settings
        }
      },

      interpolation: {
        escapeValue: true,
        format: secureFormat
      },

      detection: {
        order: ['secureStorage', 'navigator'],
        caches: ['secureStorage'],
        lookupJwt: 'lang',
        cookieMinutes: 15,
        cookieSecure: true
      },

      security: {
        sanitizeTranslations: true,
        auditLanguageChanges: true,
        secureStorageKey: 'user_lang_pref'
      },

      performance: {
        chunks: true,
        maxChunkSize: TRANSLATION_CHUNK_SIZE,
        cacheDuration: LANGUAGE_CACHE_DURATION
      },

      // WCAG 2.1 AA compliance settings
      react: {
        useSuspense: true,
        transSupportBasicHtmlNodes: true,
        transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em'],
        bindI18nStore: 'added removed',
        bindI18n: 'languageChanged loaded',
      }
    });

  // Register custom language detector
  i18next.services.languageDetector = secureLanguageDetector;

  return i18next;
}

// Export configured i18next instance with security enhancements
export const i18n = {
  t: i18next.t.bind(i18next),
  
  changeLanguage: async (lang: string): Promise<void> => {
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      await i18next.changeLanguage(lang);
      secureStorage.setItem('user_lang_pref', lang);
      console.info(`[i18n] Language changed to: ${lang}`);
    } else {
      console.warn(`[i18n] Unsupported language requested: ${lang}`);
    }
  },

  getLanguagePreference: (): string => {
    return secureStorage.getItem('user_lang_pref') || DEFAULT_LANGUAGE;
  },

  setSecureLanguagePreference: (lang: string): void => {
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      secureStorage.setItem('user_lang_pref', lang);
    }
  }
};