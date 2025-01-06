/**
 * WebSocket configuration for CrimeMiner web application.
 * Implements secure WebSocket connections with FedRAMP High and CJIS compliance
 * for real-time notifications, alerts, and collaborative case management.
 * @version 1.0.0
 */

import { ManagerOptions } from 'socket.io-client'; // v4.7.2
import { API_VERSION } from '../constants/api.constants';

/**
 * Comprehensive WebSocket configuration with security and compliance settings
 */
export const WEBSOCKET_CONFIG = {
  /**
   * Standardized WebSocket event types for real-time communication
   */
  EVENTS: {
    // Evidence-related events
    EVIDENCE_UPLOADED: 'evidence.uploaded',
    ANALYSIS_COMPLETE: 'analysis.complete',
    
    // Case management events
    CASE_UPDATED: 'case.updated',
    ALERT_TRIGGERED: 'alert.triggered',
    
    // Security events
    SESSION_EXPIRED: 'session.expired',
    SECURITY_ALERT: 'security.alert',
    
    // Audit events
    AUDIT_LOG: 'audit.log'
  },

  /**
   * Socket.io client connection configuration
   */
  CONNECTION_OPTIONS: {
    url: import.meta.env.VITE_WS_URL,
    path: `/ws/${API_VERSION}`,
    transports: ['websocket'], // Force WebSocket transport only
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: false // Manual connection management for security
  } as ManagerOptions,

  /**
   * Enhanced security options for FedRAMP High compliance
   */
  SECURITY_OPTIONS: {
    secure: true, // Require TLS
    rejectUnauthorized: true, // Strict certificate validation
    cert: import.meta.env.VITE_WS_CERT_PATH,
    headers: {
      'X-CJIS-Security': 'required',
      'X-FedRAMP-Level': 'high',
      'X-Audit-Session': 'required'
    },
    // Connection health monitoring
    pingTimeout: 5000,
    pingInterval: 10000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1_000_000 // 1MB limit
  },

  /**
   * Rate limiting configuration to prevent abuse
   */
  RATE_LIMITS: {
    MESSAGE_RATE: 100, // Messages per minute
    BURST_RATE: 200, // Maximum burst rate
    TIME_WINDOW: 60000, // 1 minute window
    MAX_CONNECTIONS: 5, // Max concurrent connections per user
    THROTTLE_THRESHOLD: 0.8 // Throttle at 80% of limit
  },

  /**
   * FedRAMP and CJIS compliance settings
   */
  COMPLIANCE_OPTIONS: {
    auditLevel: 'detailed', // Enhanced audit logging
    sessionTracking: true, // Track all WebSocket sessions
    activityLogging: true, // Log all WebSocket activities
    retentionPeriod: 2_592_000, // 30 days retention in seconds
    encryptionRequired: true, // Require TLS encryption
    cjisCompliance: true, // CJIS security policy compliance
    fedrampLevel: 'high' // FedRAMP High baseline
  }
} as const;

/**
 * Type definitions for WebSocket configuration
 */
export type WebSocketEvents = typeof WEBSOCKET_CONFIG.EVENTS;
export type WebSocketSecurityOptions = typeof WEBSOCKET_CONFIG.SECURITY_OPTIONS;
export type WebSocketComplianceOptions = typeof WEBSOCKET_CONFIG.COMPLIANCE_OPTIONS;
export type WebSocketRateLimits = typeof WEBSOCKET_CONFIG.RATE_LIMITS;

/**
 * Export the entire configuration as a frozen object to prevent modifications
 */
export default Object.freeze(WEBSOCKET_CONFIG);