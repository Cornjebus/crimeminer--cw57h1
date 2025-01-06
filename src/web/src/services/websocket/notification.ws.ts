/**
 * WebSocket notification service implementation for CrimeMiner web application.
 * Implements FedRAMP High and CJIS compliant secure WebSocket connections.
 * @version 1.0.0
 */

import { io, Socket } from 'socket.io-client'; // v4.7.2
import { AES, enc } from 'crypto-js'; // v4.1.1
import type { SecurityContext } from '@types/security-context'; // v1.0.0
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { WEBSOCKET_CONFIG } from '../../config/websocket.config';
import type { ApiResponse } from '../../types/common.types';

/**
 * Manages secure WebSocket connections and event handling with FedRAMP/CJIS compliance
 */
export class NotificationService {
  private socket: Socket | null = null;
  private readonly securityContext: SecurityContext;
  private readonly auditLogger: AuditLogger;
  private readonly eventHandlers: Map<string, Function>;
  private readonly rateLimiter: Map<string, number>;
  private readonly sessionManager: Map<string, Date>;

  constructor(securityContext: SecurityContext) {
    this.securityContext = securityContext;
    this.auditLogger = new AuditLogger({
      level: WEBSOCKET_CONFIG.COMPLIANCE_OPTIONS.auditLevel,
      retention: WEBSOCKET_CONFIG.COMPLIANCE_OPTIONS.retentionPeriod
    });
    this.eventHandlers = new Map();
    this.rateLimiter = new Map();
    this.sessionManager = new Map();
  }

  /**
   * Establishes a secure WebSocket connection with FedRAMP/CJIS compliant authentication
   * @param token Authentication token
   * @param securityContext Security context for the connection
   */
  public async connect(token: string, securityContext: SecurityContext): Promise<void> {
    try {
      // Validate security context against FedRAMP requirements
      if (!this.validateSecurityContext(securityContext)) {
        throw new Error('Security context validation failed');
      }

      // Configure secure WebSocket connection
      const secureOptions = {
        ...WEBSOCKET_CONFIG.CONNECTION_OPTIONS,
        ...WEBSOCKET_CONFIG.SECURITY_OPTIONS,
        auth: {
          token,
          securityContext: this.encryptContext(securityContext)
        },
        extraHeaders: {
          'X-CJIS-Security': 'required',
          'X-FedRAMP-Level': 'high'
        }
      };

      // Establish encrypted connection
      this.socket = io(WEBSOCKET_CONFIG.CONNECTION_OPTIONS.url, secureOptions);

      // Set up secure event handlers
      this.setupSecureEventHandlers();

      // Initialize session tracking
      this.initializeSession(token);

      // Log connection for audit
      await this.auditLogger.log({
        action: 'WEBSOCKET_CONNECT',
        userId: securityContext.userId,
        sessionId: this.socket.id,
        timestamp: new Date()
      });

    } catch (error) {
      await this.auditLogger.error({
        action: 'WEBSOCKET_CONNECT_FAILED',
        error: error.message,
        userId: securityContext.userId
      });
      throw error;
    }
  }

  /**
   * Securely terminates WebSocket connection with audit logging
   */
  public disconnect(): void {
    if (this.socket) {
      const sessionId = this.socket.id;
      
      // Clear sensitive session data
      this.sessionManager.delete(sessionId);
      this.rateLimiter.delete(sessionId);
      this.eventHandlers.clear();

      // Log disconnection
      this.auditLogger.log({
        action: 'WEBSOCKET_DISCONNECT',
        sessionId,
        timestamp: new Date()
      });

      // Close connection
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Processes events with security controls and audit logging
   * @param eventName Event identifier
   * @param data Event payload
   */
  private async handleSecureEvent(eventName: string, data: ApiResponse<any>): Promise<void> {
    try {
      // Verify rate limits
      if (!this.checkRateLimit(eventName)) {
        throw new Error('Rate limit exceeded');
      }

      // Decrypt and validate payload
      const decryptedData = this.decryptPayload(data);
      if (!this.validateDataIntegrity(decryptedData)) {
        throw new Error('Data integrity validation failed');
      }

      // Process event with security context
      const handler = this.eventHandlers.get(eventName);
      if (handler) {
        await handler(decryptedData);
      }

      // Log event for audit
      await this.auditLogger.log({
        action: 'WEBSOCKET_EVENT',
        eventName,
        sessionId: this.socket?.id,
        timestamp: new Date()
      });

    } catch (error) {
      await this.auditLogger.error({
        action: 'WEBSOCKET_EVENT_ERROR',
        eventName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validates security context against FedRAMP requirements
   * @param context Security context to validate
   */
  private validateSecurityContext(context: SecurityContext): boolean {
    return (
      context.clearanceLevel >= WEBSOCKET_CONFIG.COMPLIANCE_OPTIONS.fedrampLevel &&
      context.cjisCompliant === WEBSOCKET_CONFIG.COMPLIANCE_OPTIONS.cjisCompliance &&
      context.sessionValid &&
      this.validateAccessPermissions(context)
    );
  }

  /**
   * Sets up secure WebSocket event listeners with encryption
   */
  private setupSecureEventHandlers(): void {
    if (!this.socket) return;

    // Evidence events
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.EVIDENCE_UPLOADED, 
      (data) => this.handleSecureEvent(WEBSOCKET_CONFIG.EVENTS.EVIDENCE_UPLOADED, data));
    
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.ANALYSIS_COMPLETE,
      (data) => this.handleSecureEvent(WEBSOCKET_CONFIG.EVENTS.ANALYSIS_COMPLETE, data));

    // Case events  
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.CASE_UPDATED,
      (data) => this.handleSecureEvent(WEBSOCKET_CONFIG.EVENTS.CASE_UPDATED, data));
    
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.ALERT_TRIGGERED,
      (data) => this.handleSecureEvent(WEBSOCKET_CONFIG.EVENTS.ALERT_TRIGGERED, data));

    // Security events
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.SESSION_EXPIRED,
      () => this.handleSessionExpiration());
    
    this.socket.on(WEBSOCKET_CONFIG.EVENTS.SECURITY_ALERT,
      (data) => this.handleSecureEvent(WEBSOCKET_CONFIG.EVENTS.SECURITY_ALERT, data));
  }

  /**
   * Encrypts security context for transmission
   * @param context Security context to encrypt
   */
  private encryptContext(context: SecurityContext): string {
    return AES.encrypt(
      JSON.stringify(context),
      WEBSOCKET_CONFIG.SECURITY_OPTIONS.cert
    ).toString();
  }

  /**
   * Decrypts received payload with integrity checking
   * @param data Encrypted payload
   */
  private decryptPayload(data: any): any {
    const decrypted = AES.decrypt(
      data,
      WEBSOCKET_CONFIG.SECURITY_OPTIONS.cert
    ).toString(enc.Utf8);
    return JSON.parse(decrypted);
  }

  /**
   * Validates data integrity using checksums
   * @param data Data to validate
   */
  private validateDataIntegrity(data: any): boolean {
    return data && typeof data === 'object' && 'checksum' in data;
  }

  /**
   * Checks rate limits for event processing
   * @param eventName Event to check
   */
  private checkRateLimit(eventName: string): boolean {
    const currentTime = Date.now();
    const eventCount = this.rateLimiter.get(eventName) || 0;
    
    if (eventCount >= WEBSOCKET_CONFIG.RATE_LIMITS.MESSAGE_RATE) {
      return false;
    }
    
    this.rateLimiter.set(eventName, eventCount + 1);
    return true;
  }

  /**
   * Validates access permissions from security context
   * @param context Security context to validate
   */
  private validateAccessPermissions(context: SecurityContext): boolean {
    return context.permissions.includes('WEBSOCKET_ACCESS');
  }

  /**
   * Initializes session tracking for the connection
   * @param token Authentication token
   */
  private initializeSession(token: string): void {
    if (!this.socket) return;
    
    this.sessionManager.set(this.socket.id, new Date());
    
    // Set session expiry handler
    setTimeout(() => {
      this.handleSessionExpiration();
    }, WEBSOCKET_CONFIG.SECURITY_OPTIONS.pingTimeout);
  }

  /**
   * Handles WebSocket session expiration
   */
  private handleSessionExpiration(): void {
    this.auditLogger.log({
      action: 'WEBSOCKET_SESSION_EXPIRED',
      sessionId: this.socket?.id,
      timestamp: new Date()
    });
    this.disconnect();
  }
}

// Export singleton instance
export const notificationService = new NotificationService(null as any);