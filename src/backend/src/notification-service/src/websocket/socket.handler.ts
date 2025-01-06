/**
 * @file WebSocket handler for secure real-time notification delivery
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant WebSocket communication
 */

import WebSocket from 'ws'; // v8.14.2
import { Request } from 'express';
import * as jwt from 'jsonwebtoken'; // v9.0.2
import * as crypto from 'crypto';
import { INotification, IWebSocketEvent, NotificationType } from '../interfaces/notification.interface';
import { logger } from '../../../common/utils/logger.util';
import { AuthErrorCodes, SecurityErrorCodes } from '../../../common/constants/error-codes';

// Security-related constants
const WS_HEARTBEAT_INTERVAL = 30000;
const WS_CLOSE_TIMEOUT = 5000;
const WS_MAX_CONNECTIONS_PER_USER = 3;
const WS_RATE_LIMIT_WINDOW = 60000;
const WS_RATE_LIMIT_MAX_MESSAGES = 100;

/**
 * WebSocket handler implementing FedRAMP and CJIS compliant real-time communication
 */
export class WebSocketHandler {
  private static instance: WebSocketHandler;
  private clients: Map<string, WebSocket>;
  private userSessions: Map<string, string>;
  private messageRateLimit: Map<string, number>;
  private userConnections: Map<string, Set<string>>;
  private encryptionKey: crypto.KeyObject;
  private readonly iv: Buffer;

  private constructor() {
    this.clients = new Map();
    this.userSessions = new Map();
    this.messageRateLimit = new Map();
    this.userConnections = new Map();
    
    // Initialize encryption key and IV for secure communication
    this.encryptionKey = crypto.generateKeySync('aes', { length: 256 });
    this.iv = crypto.randomBytes(16);

    // Set up periodic security checks
    setInterval(() => this.performSecurityChecks(), WS_HEARTBEAT_INTERVAL);
  }

  /**
   * Get singleton instance with security context
   */
  public static getInstance(): WebSocketHandler {
    if (!WebSocketHandler.instance) {
      WebSocketHandler.instance = new WebSocketHandler();
    }
    return WebSocketHandler.instance;
  }

  /**
   * Handle new WebSocket connections with security validation
   */
  public async handleConnection(socket: WebSocket, request: Request): Promise<void> {
    try {
      // Extract and validate JWT token
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) {
        throw new Error(AuthErrorCodes.INVALID_TOKEN);
      }

      // Verify token and extract user ID
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      const userId = decoded.userId;

      // Check connection limits
      if (this.exceedsConnectionLimit(userId)) {
        socket.close(1008, 'Connection limit exceeded');
        return;
      }

      // Generate secure session ID
      const sessionId = crypto.randomBytes(32).toString('hex');
      this.registerClient(userId, sessionId, socket);

      // Set up secure message handling
      this.setupSecureMessageHandlers(socket, userId, sessionId);

      // Log secure connection
      logger.info('WebSocket connection established', {
        userId,
        sessionId,
        sourceIp: request.ip,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('WebSocket connection failed', error as Error, {
        sourceIp: request.ip,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });
      socket.close(1008, 'Authentication failed');
    }
  }

  /**
   * Broadcast notifications with encryption and rate limiting
   */
  public async broadcast(event: IWebSocketEvent): Promise<void> {
    try {
      // Encrypt notification payload
      const encryptedPayload = this.encryptPayload(event.payload);
      
      const recipientSocket = this.clients.get(event.payload.recipientId);
      if (!recipientSocket || recipientSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      // Check rate limits
      if (this.isRateLimited(event.payload.recipientId)) {
        logger.warn('Rate limit exceeded for user', {
          userId: event.payload.recipientId,
          requestId: crypto.randomBytes(16).toString('hex'),
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Send encrypted notification
      recipientSocket.send(JSON.stringify({
        event: event.event,
        payload: encryptedPayload,
        timestamp: new Date().toISOString()
      }));

      // Update rate limiting
      this.updateRateLimit(event.payload.recipientId);

      // Audit log successful delivery
      logger.info('Notification delivered', {
        userId: event.payload.recipientId,
        notificationId: event.payload.id,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Broadcast failed', error as Error, {
        userId: event.payload.recipientId,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle connection closure with cleanup
   */
  private handleClose(userId: string): void {
    const sessionId = this.userSessions.get(userId);
    if (sessionId) {
      this.clients.delete(userId);
      this.userSessions.delete(userId);
      this.messageRateLimit.delete(userId);
      
      const userConns = this.userConnections.get(userId);
      if (userConns) {
        userConns.delete(sessionId);
        if (userConns.size === 0) {
          this.userConnections.delete(userId);
        }
      }

      logger.info('WebSocket connection closed', {
        userId,
        sessionId,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Private helper methods for security implementation
   */
  private registerClient(userId: string, sessionId: string, socket: WebSocket): void {
    this.clients.set(userId, socket);
    this.userSessions.set(userId, sessionId);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(sessionId);
  }

  private encryptPayload(payload: INotification): string {
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, this.iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([encrypted, authTag, this.iv]).toString('base64');
  }

  private setupSecureMessageHandlers(socket: WebSocket, userId: string, sessionId: string): void {
    socket.on('close', () => this.handleClose(userId));
    
    socket.on('error', (error) => {
      logger.error('WebSocket error', error as Error, {
        userId,
        sessionId,
        requestId: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString()
      });
    });

    // Implement heartbeat
    socket.on('pong', () => {
      socket.isAlive = true;
    });
  }

  private exceedsConnectionLimit(userId: string): boolean {
    const currentConnections = this.userConnections.get(userId)?.size || 0;
    return currentConnections >= WS_MAX_CONNECTIONS_PER_USER;
  }

  private isRateLimited(userId: string): boolean {
    const currentCount = this.messageRateLimit.get(userId) || 0;
    return currentCount >= WS_RATE_LIMIT_MAX_MESSAGES;
  }

  private updateRateLimit(userId: string): void {
    const currentCount = this.messageRateLimit.get(userId) || 0;
    this.messageRateLimit.set(userId, currentCount + 1);
  }

  private performSecurityChecks(): void {
    this.clients.forEach((socket, userId) => {
      if (!socket.isAlive) {
        this.handleClose(userId);
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }
}

// Export singleton instance
export const webSocketHandler = WebSocketHandler.getInstance();