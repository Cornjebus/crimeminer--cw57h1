/**
 * @file Core notification service implementation for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant notification service
 * with real-time alerts, secure delivery, and audit logging
 */

import { Injectable } from '@nestjs/common';
import Redis from 'ioredis'; // v5.3.2
import { RateLimiterRedis } from 'rate-limiter-flexible'; // v2.4.1
import { SecurityAuditLogger } from '@crimeminer/security-logger'; // v1.0.0
import { EncryptionService } from '@crimeminer/encryption'; // v1.0.0
import { 
  INotification, 
  NotificationType,
  IWebSocketEvent,
  INotificationDeliveryStatus,
  isHighPriorityNotification,
  containsSensitiveContent
} from '../interfaces/notification.interface';
import { SecurityErrorCodes, ErrorMessages } from '../../../common/constants/error-codes';

// Global constants
const NOTIFICATION_TTL = 604800; // 7 days in seconds
const MAX_NOTIFICATIONS_PER_USER = 1000;
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const RATE_LIMIT_MAX = 100;

@Injectable()
export class NotificationService {
  private readonly rateLimiter: RateLimiterRedis;
  private readonly wsClients: Map<string, WebSocket>;

  constructor(
    private readonly redisClient: Redis,
    private readonly encryptionService: EncryptionService,
    private readonly securityLogger: SecurityAuditLogger
  ) {
    // Initialize rate limiter with Redis
    this.rateLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      points: RATE_LIMIT_MAX,
      duration: RATE_LIMIT_WINDOW,
      blockDuration: RATE_LIMIT_WINDOW
    });

    this.wsClients = new Map();
  }

  /**
   * Creates a new encrypted notification with audit trail
   * @param notification Notification data to be processed
   * @returns Promise<INotification> Encrypted notification
   */
  async createNotification(notification: INotification): Promise<INotification> {
    try {
      // Check rate limits
      await this.rateLimiter.consume(notification.recipientId);

      // Validate notification data
      if (!notification.type || !notification.recipientId) {
        throw new Error(ErrorMessages[SecurityErrorCodes.INVALID_INPUT]);
      }

      // Generate secure notification ID
      notification.id = await this.encryptionService.generateSecureId();

      // Encrypt sensitive content if present
      if (containsSensitiveContent(notification)) {
        notification.encryptedContent = await this.encryptionService.encrypt(
          JSON.stringify(notification.content)
        );
      }

      // Create audit trail
      await this.securityLogger.logNotificationCreation({
        notificationId: notification.id,
        recipientId: notification.recipientId,
        type: notification.type,
        timestamp: new Date(),
        sensitivity: isHighPriorityNotification(notification)
      });

      // Store notification with TTL
      const notificationKey = `notification:${notification.id}`;
      await this.redisClient
        .multi()
        .hmset(notificationKey, notification)
        .expire(notificationKey, NOTIFICATION_TTL)
        .exec();

      // Update user notification count
      const userNotificationCount = await this.redisClient.incr(
        `user:${notification.recipientId}:notification_count`
      );

      // Enforce per-user notification limit
      if (userNotificationCount > MAX_NOTIFICATIONS_PER_USER) {
        await this.pruneOldNotifications(notification.recipientId);
      }

      return notification;
    } catch (error) {
      await this.securityLogger.logError({
        action: 'CREATE_NOTIFICATION',
        error: error.message,
        notificationId: notification.id,
        recipientId: notification.recipientId
      });
      throw error;
    }
  }

  /**
   * Securely delivers notification via WebSocket
   * @param notification Notification to be delivered
   * @returns Promise<void>
   */
  async sendNotification(notification: INotification): Promise<void> {
    try {
      // Verify recipient session
      const recipientSocket = this.wsClients.get(notification.recipientId);
      if (!recipientSocket) {
        await this.queueOfflineDelivery(notification);
        return;
      }

      // Create secure WebSocket event
      const wsEvent: IWebSocketEvent = {
        event: notification.type,
        payload: notification,
        timestamp: new Date(),
        rateLimitKey: `ws:${notification.recipientId}`
      };

      // Sign payload for integrity
      const signedPayload = await this.encryptionService.signPayload(
        JSON.stringify(wsEvent)
      );

      // Send notification
      recipientSocket.send(signedPayload);

      // Create delivery status
      const deliveryStatus: INotificationDeliveryStatus = {
        notificationId: notification.id,
        channel: 'websocket',
        status: 'DELIVERED',
        attempts: 1,
        lastAttempt: new Date()
      };

      // Update delivery status and audit log
      await Promise.all([
        this.updateDeliveryStatus(deliveryStatus),
        this.securityLogger.logNotificationDelivery({
          notificationId: notification.id,
          recipientId: notification.recipientId,
          channel: 'websocket',
          status: 'DELIVERED',
          timestamp: new Date()
        })
      ]);
    } catch (error) {
      // Handle delivery failure
      const deliveryStatus: INotificationDeliveryStatus = {
        notificationId: notification.id,
        channel: 'websocket',
        status: 'FAILED',
        attempts: 1,
        lastAttempt: new Date(),
        error: error.message
      };

      await Promise.all([
        this.updateDeliveryStatus(deliveryStatus),
        this.securityLogger.logError({
          action: 'SEND_NOTIFICATION',
          error: error.message,
          notificationId: notification.id,
          recipientId: notification.recipientId
        })
      ]);

      throw error;
    }
  }

  /**
   * Updates WebSocket client registry with secure session tracking
   * @param userId User ID
   * @param socket WebSocket connection
   */
  registerWebSocketClient(userId: string, socket: WebSocket): void {
    this.wsClients.set(userId, socket);
    this.securityLogger.logWebSocketConnection({
      userId,
      timestamp: new Date(),
      action: 'CONNECT'
    });
  }

  /**
   * Removes WebSocket client with audit logging
   * @param userId User ID
   */
  removeWebSocketClient(userId: string): void {
    this.wsClients.delete(userId);
    this.securityLogger.logWebSocketConnection({
      userId,
      timestamp: new Date(),
      action: 'DISCONNECT'
    });
  }

  /**
   * Updates notification delivery status
   * @param status Delivery status details
   */
  private async updateDeliveryStatus(
    status: INotificationDeliveryStatus
  ): Promise<void> {
    const statusKey = `delivery:${status.notificationId}`;
    await this.redisClient
      .multi()
      .hmset(statusKey, status)
      .expire(statusKey, NOTIFICATION_TTL)
      .exec();
  }

  /**
   * Queues notification for offline delivery
   * @param notification Notification to queue
   */
  private async queueOfflineDelivery(notification: INotification): Promise<void> {
    const queueKey = `offline_queue:${notification.recipientId}`;
    await this.redisClient
      .multi()
      .lpush(queueKey, JSON.stringify(notification))
      .expire(queueKey, NOTIFICATION_TTL)
      .exec();
  }

  /**
   * Removes old notifications when user exceeds limit
   * @param userId User ID
   */
  private async pruneOldNotifications(userId: string): Promise<void> {
    const userNotifications = await this.redisClient.keys(
      `notification:*:${userId}`
    );
    const oldestNotifications = userNotifications
      .sort()
      .slice(0, userNotifications.length - MAX_NOTIFICATIONS_PER_USER);
    
    if (oldestNotifications.length > 0) {
      await this.redisClient
        .multi()
        .del(...oldestNotifications)
        .decr(`user:${userId}:notification_count`)
        .exec();
    }
  }
}