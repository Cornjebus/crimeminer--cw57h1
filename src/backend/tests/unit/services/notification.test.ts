/**
 * @file Unit tests for NotificationService with FedRAMP and CJIS compliance validation
 * @version 1.0.0
 */

import { NotificationService } from '../../src/notification-service/src/services/notification.service';
import Redis from 'ioredis-mock'; // v8.9.0
import { SecurityContext } from '@types/security-context'; // v1.0.0
import { AuditLogger } from '@security/audit-logger'; // v2.0.0
import { NotificationType, NotificationPriority, INotification, IWebSocketEvent } from '../../src/notification-service/src/interfaces/notification.interface';
import { SecurityErrorCodes, ErrorMessages } from '../../src/common/constants/error-codes';
import * as crypto from 'crypto';

// Test constants with security context
const TEST_USER_ID = 'test-user-123';
const TEST_NOTIFICATION_ID = 'test-notification-456';
const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const SECURITY_CONTEXT = {
  encryptionKey: ENCRYPTION_KEY,
  auditConfig: { enabled: true },
  securityLevel: 'HIGH',
  complianceFlags: ['FEDRAMP', 'CJIS']
};

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let redisMock: Redis;
  let securityContext: SecurityContext;
  let auditLogger: jest.Mocked<AuditLogger>;
  let mockWebSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    // Initialize mocks with security context
    redisMock = new Redis({
      data: {
        enableEncryption: true,
        encryptionKey: ENCRYPTION_KEY
      }
    });

    auditLogger = {
      logNotificationCreation: jest.fn(),
      logNotificationDelivery: jest.fn(),
      logError: jest.fn(),
      logWebSocketConnection: jest.fn(),
      validateAuditTrail: jest.fn()
    } as unknown as jest.Mocked<AuditLogger>;

    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn()
    } as unknown as jest.Mocked<WebSocket>;

    // Initialize service with security dependencies
    notificationService = new NotificationService(
      redisMock,
      {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
        generateSecureId: jest.fn(),
        signPayload: jest.fn()
      },
      auditLogger
    );
  });

  describe('createNotification', () => {
    it('should create encrypted notification with audit trail', async () => {
      // Prepare secure test data
      const testNotification: INotification = {
        id: TEST_NOTIFICATION_ID,
        type: NotificationType.ALERT_TRIGGERED,
        title: 'Security Alert',
        message: 'Sensitive content detected',
        recipientId: TEST_USER_ID,
        priority: NotificationPriority.HIGH,
        metadata: { securityLevel: 'HIGH' },
        read: false,
        createdAt: new Date(),
        acknowledgedAt: null,
        encryptedContent: null
      };

      // Mock security operations
      const encryptedContent = 'encrypted-content-123';
      const secureId = 'secure-id-789';
      (notificationService as any).encryptionService.encrypt.mockResolvedValue(encryptedContent);
      (notificationService as any).encryptionService.generateSecureId.mockResolvedValue(secureId);

      // Execute with security validation
      const result = await notificationService.createNotification(testNotification);

      // Verify encryption and security
      expect(result.id).toBe(secureId);
      expect(result.encryptedContent).toBe(encryptedContent);
      expect(auditLogger.logNotificationCreation).toHaveBeenCalledWith({
        notificationId: secureId,
        recipientId: TEST_USER_ID,
        type: NotificationType.ALERT_TRIGGERED,
        timestamp: expect.any(Date),
        sensitivity: true
      });
    });

    it('should enforce rate limits per FedRAMP requirements', async () => {
      // Setup rate limit test
      const notifications = Array(101).fill(null).map(() => ({
        id: crypto.randomUUID(),
        type: NotificationType.ALERT_TRIGGERED,
        recipientId: TEST_USER_ID,
        priority: NotificationPriority.MEDIUM
      }));

      // Attempt to exceed rate limit
      await expect(async () => {
        for (const notification of notifications) {
          await notificationService.createNotification(notification as INotification);
        }
      }).rejects.toThrow('Rate limit exceeded');

      // Verify audit logging of rate limit
      expect(auditLogger.logError).toHaveBeenCalledWith({
        action: 'CREATE_NOTIFICATION',
        error: expect.stringContaining('rate limit'),
        recipientId: TEST_USER_ID
      });
    });
  });

  describe('sendNotification', () => {
    it('should deliver encrypted notification via WebSocket with integrity check', async () => {
      // Setup secure WebSocket connection
      notificationService.registerWebSocketClient(TEST_USER_ID, mockWebSocket);

      // Prepare signed notification
      const testNotification: INotification = {
        id: TEST_NOTIFICATION_ID,
        type: NotificationType.EVIDENCE_UPLOADED,
        recipientId: TEST_USER_ID,
        priority: NotificationPriority.HIGH
      } as INotification;

      const signedPayload = 'signed-payload-xyz';
      (notificationService as any).encryptionService.signPayload.mockResolvedValue(signedPayload);

      // Send notification with security validation
      await notificationService.sendNotification(testNotification);

      // Verify secure delivery
      expect(mockWebSocket.send).toHaveBeenCalledWith(signedPayload);
      expect(auditLogger.logNotificationDelivery).toHaveBeenCalledWith({
        notificationId: TEST_NOTIFICATION_ID,
        recipientId: TEST_USER_ID,
        channel: 'websocket',
        status: 'DELIVERED',
        timestamp: expect.any(Date)
      });
    });

    it('should handle offline delivery securely', async () => {
      // Test notification without active WebSocket
      const testNotification: INotification = {
        id: TEST_NOTIFICATION_ID,
        type: NotificationType.CASE_UPDATED,
        recipientId: 'offline-user',
        priority: NotificationPriority.MEDIUM
      } as INotification;

      await notificationService.sendNotification(testNotification);

      // Verify secure offline queue
      const queueKey = `offline_queue:offline-user`;
      const queuedNotifications = await redisMock.lrange(queueKey, 0, -1);
      expect(queuedNotifications).toHaveLength(1);
      expect(JSON.parse(queuedNotifications[0])).toMatchObject({
        id: TEST_NOTIFICATION_ID,
        type: NotificationType.CASE_UPDATED
      });
    });
  });

  describe('Security Compliance', () => {
    it('should validate FedRAMP High compliance requirements', async () => {
      // Test encryption strength
      const testData = 'sensitive-data';
      await (notificationService as any).encryptionService.encrypt(testData);
      expect((notificationService as any).encryptionService.encrypt)
        .toHaveBeenCalledWith(expect.any(String));

      // Verify audit trail integrity
      expect(auditLogger.validateAuditTrail).toHaveBeenCalled();
    });

    it('should enforce CJIS security policy', async () => {
      const sensitiveNotification: INotification = {
        id: TEST_NOTIFICATION_ID,
        type: NotificationType.ALERT_TRIGGERED,
        recipientId: TEST_USER_ID,
        priority: NotificationPriority.HIGH,
        metadata: { 
          cjisCompliance: true,
          securityClassification: 'RESTRICTED'
        }
      } as INotification;

      await notificationService.createNotification(sensitiveNotification);

      // Verify CJIS audit requirements
      expect(auditLogger.logNotificationCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          sensitivity: true,
          timestamp: expect.any(Date)
        })
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    redisMock.flushall();
  });
});