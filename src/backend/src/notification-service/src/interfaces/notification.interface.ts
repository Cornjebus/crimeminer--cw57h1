/**
 * @file Notification system interface definitions for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant notification interfaces
 * with real-time alerts, WebSocket communication, and secure delivery
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';

/**
 * Enumeration of supported notification types with audit logging support
 */
export enum NotificationType {
  EVIDENCE_UPLOADED = 'EVIDENCE_UPLOADED',
  ANALYSIS_COMPLETE = 'ANALYSIS_COMPLETE',
  CASE_UPDATED = 'CASE_UPDATED',
  ALERT_TRIGGERED = 'ALERT_TRIGGERED'
}

/**
 * Enhanced enumeration of notification priority levels supporting FedRAMP compliance
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * Core notification data structure with enhanced security and compliance features
 * Extends IBaseEntity for audit trail compliance
 */
export interface INotification extends IBaseEntity {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  recipientId: string;
  metadata: Record<string, any>;
  priority: NotificationPriority;
  read: boolean;
  createdAt: Date;
  acknowledgedAt: Date | null;
  encryptedContent: string | null; // For sensitive notification content
}

/**
 * WebSocket event structure with rate limiting support
 * Implements CJIS-compliant real-time communication
 */
export interface IWebSocketEvent {
  event: NotificationType;
  payload: INotification;
  timestamp: Date;
  rateLimitKey: string; // For rate limiting enforcement
}

/**
 * Enhanced interface for user notification subscriptions with multi-channel support
 * Supports FedRAMP-compliant notification delivery rules
 */
export interface INotificationSubscription {
  userId: string;
  types: NotificationType[];
  channels: string[]; // Supported delivery channels (websocket, email, sms)
  preferences: Record<string, any>; // User-specific notification settings
  deliveryRules: Record<string, any>; // Channel-specific delivery rules
}

/**
 * Type guard to check if a notification is high priority
 */
export const isHighPriorityNotification = (
  notification: INotification
): boolean => {
  return (
    notification.priority === NotificationPriority.HIGH ||
    notification.priority === NotificationPriority.URGENT
  );
};

/**
 * Type guard to check if a notification contains sensitive information
 */
export const containsSensitiveContent = (
  notification: INotification
): boolean => {
  return notification.encryptedContent !== null;
};

/**
 * Type guard to validate notification type
 */
export const isValidNotificationType = (
  type: string
): type is NotificationType => {
  return Object.values(NotificationType).includes(type as NotificationType);
};

/**
 * Interface for notification rate limit configuration
 * Implements FedRAMP-compliant rate limiting
 */
export interface INotificationRateLimit {
  userId: string;
  type: NotificationType;
  windowMs: number;
  maxRequests: number;
  currentCount: number;
  windowStart: Date;
}

/**
 * Interface for notification delivery status
 * Supports CJIS-compliant delivery tracking
 */
export interface INotificationDeliveryStatus {
  notificationId: string;
  channel: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  lastAttempt: Date;
  error?: string;
}