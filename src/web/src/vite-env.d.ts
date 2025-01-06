/// <reference types="vite/client" version="^4.4.0" />

/**
 * Type definitions for Vite environment variables used in CrimeMiner web application
 * Enforces strict type safety and validation for environment-specific configuration
 */

interface ImportMetaEnv {
  /**
   * Base URL for backend API endpoints
   * Must be a valid HTTP/HTTPS URL ending with /api
   * @example 'https://api.crimeminer.gov/api'
   */
  readonly VITE_API_URL: string;

  /**
   * WebSocket server URL for real-time notifications
   * Must be a secure WSS URL ending with /ws
   * @example 'wss://ws.crimeminer.gov/ws'
   */
  readonly VITE_WS_URL: string;

  /**
   * Authentication service URL
   * Must be a secure HTTPS URL ending with /auth
   * @example 'https://auth.crimeminer.gov/auth'
   */
  readonly VITE_AUTH_URL: string;

  /**
   * Current deployment environment
   * Strictly typed to allowed values
   */
  readonly VITE_ENVIRONMENT: 'development' | 'staging' | 'production';

  /**
   * API version identifier
   * Must follow semantic versioning format vX.Y
   * @example 'v1.0'
   */
  readonly VITE_API_VERSION: string;

  /**
   * Maximum allowed file upload size in bytes
   * Must be a positive integer
   * @example 104857600 // 100MB
   */
  readonly VITE_MAX_UPLOAD_SIZE: number;

  /**
   * Feature flag configuration object
   * Keys represent feature names, values are boolean flags
   * @example { 'enableNewUI': true, 'enableBetaFeatures': false }
   */
  readonly VITE_FEATURE_FLAGS: Record<string, boolean>;
}

/**
 * Augment the Vite ImportMeta interface with our custom env interface
 * This provides type safety when accessing import.meta.env
 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Type guard to validate environment variable format
 */
declare function validateEnvFormat(env: ImportMetaEnv): boolean;

/**
 * Type guard to validate URL format for API, WebSocket and Auth URLs
 */
declare function validateUrlFormat(url: string, type: 'api' | 'ws' | 'auth'): boolean;

/**
 * Type guard to validate API version format
 */
declare function validateApiVersion(version: string): boolean;

/**
 * Type guard to validate upload size limits
 */
declare function validateUploadSize(size: number): boolean;

/**
 * Type guard to validate feature flag configuration
 */
declare function validateFeatureFlags(flags: Record<string, boolean>): boolean;