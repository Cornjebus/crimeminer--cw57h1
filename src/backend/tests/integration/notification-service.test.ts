/**
 * @file Integration tests for CrimeMiner notification service
 * @version 1.0.0
 * @description Validates FedRAMP High and CJIS compliant notification functionality
 * including real-time delivery, encryption, and audit logging
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import Redis from 'ioredis'; // v5.3.2
import WebSocket from 'ws'; // v8.14.2
import { SecurityAuditLogger } from '@company/security-audit-logger'; // v1.0.0
import { EncryptionService } from '@company/encryption-service'; // v1.0.0
import { NotificationService } from '../../src/notification-service/src/services/notification.service';
import { 
  NotificationType, 
  NotificationPriority,
  INotification,
  IWebSocketEvent
} from '../../src/notification-service/src/interfaces/notification.interface';
import { SecurityErrorCodes, ErrorMessages } from '../../src/common/constants/error-codes';

// Test constants
const TEST_USER_ID = 'test-user-123';
const TEST_NOTIFICATION_TTL = 604800;
const SECURITY_CONTEXT = {
  userId: TEST_USER_ID,
  role: 'investigator',
  sessionId: 'test-session-123'
};

describe('NotificationService Integration Tests', () => {
  let notificationService: NotificationService;
  let redisClient: Redis;
  let wsServer: WebSocket.Server;
  let wsClient: WebSocket;
  let securityLogger: SecurityAuditLogger;
  let encryptionService: EncryptionService;

  beforeAll(async () => {
    // Initialize Redis with TLS
    redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      tls: {
        rejectUnauthorized: true,
        ca: process.env.REDIS_CA_CERT
      }
    });

    // Initialize security services
    securityLogger = new SecurityAuditLogger({
      context: SECURITY_CONTEXT,
      compliance: ['FedRAMP-High', 'CJIS']
    });

    encryptionService = new EncryptionService({
      keyVaultUrl: process.env.KEY_VAULT_URL,
      keyIdentifier: process.env.NOTIFICATION_KEY_ID
    });

    // Initialize WebSocket server with TLS
    wsServer = new WebSocket.Server({
      port: parseInt(process.env.WS_TEST_PORT || '8080'),
      clientTracking: true,
      maxPayload: 1048576, // 1MB limit
      perMessageDeflate: true
    });

    // Initialize notification service
    notificationService = new NotificationService(
      redisClient,
      encryptionService,
      securityLogger
    );

    // Setup WebSocket client with security context
    wsClient = new WebSocket(`wss://localhost:${process.env.WS_TEST_PORT}`, {
      headers: {
        'X-Security-Context': JSON.stringify(SECURITY_CONTEXT)
      },
      rejectUnauthorized: true,
      ca: process.env.WS_CA_CERT
    });

    // Wait for WebSocket connection
    await new Promise<void>((resolve) => {
      wsClient.on('open', () => resolve());
    });
  });

  afterAll(async () => {
    // Cleanup connections securely
    await redisClient.quit();
    await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    wsClient.close();

    // Clear test data with secure wipe
    const testKeys = await redisClient.keys('notification:test-*');
    if (testKeys.length > 0) {
      await redisClient.del(...testKeys);
    }

    // Verify audit log completion
    await securityLogger.finalizeAuditTrail(SECURITY_CONTEXT);
  });

  test('should create encrypted notification with audit trail', async () => {
    // Create test notification with security metadata
    const testNotification: INotification = {
      id: '',
      type: NotificationType.ALERT_TRIGGERED,
      title: 'Security Alert',
      message: 'Sensitive content detected',
      recipientId: TEST_USER_ID,
      metadata: {
        classification: 'SENSITIVE',
        caseId: 'test-case-123'
      },
      priority: NotificationPriority.HIGH,
      read: false,
      createdAt: new Date(),
      acknowledgedAt: null,
      encryptedContent: null
    };

    // Create notification
    const createdNotification = await notificationService.createNotification(testNotification);

    // Verify encryption
    expect(createdNotification.id).toBeTruthy();
    expect(createdNotification.encryptedContent).toBeTruthy();

    // Verify audit trail
    const auditLog = await securityLogger.getAuditTrail({
      notificationId: createdNotification.id,
      action: 'CREATE_NOTIFICATION'
    });
    expect(auditLog).toBeTruthy();
    expect(auditLog.compliance).toContain('CJIS');
  });

  test('should securely deliver notification via encrypted WebSocket', async () => {
    // Setup WebSocket message handler
    const messagePromise = new Promise<IWebSocketEvent>((resolve) => {
      wsClient.once('message', async (data) => {
        const verified = await encryptionService.verifySignature(data.toString());
        expect(verified).toBe(true);
        resolve(JSON.parse(data.toString()));
      });
    });

    // Create and send test notification
    const testNotification: INotification = {
      id: '',
      type: NotificationType.EVIDENCE_UPLOADED,
      title: 'New Evidence',
      message: 'Evidence file uploaded',
      recipientId: TEST_USER_ID,
      metadata: {
        evidenceId: 'test-evidence-123'
      },
      priority: NotificationPriority.MEDIUM,
      read: false,
      createdAt: new Date(),
      acknowledgedAt: null,
      encryptedContent: null
    };

    await notificationService.createNotification(testNotification);
    await notificationService.sendNotification(testNotification);

    // Verify secure delivery
    const receivedEvent = await messagePromise;
    expect(receivedEvent.event).toBe(NotificationType.EVIDENCE_UPLOADED);
    expect(receivedEvent.payload.recipientId).toBe(TEST_USER_ID);

    // Verify delivery audit log
    const deliveryLog = await securityLogger.getAuditTrail({
      notificationId: testNotification.id,
      action: 'NOTIFICATION_DELIVERY'
    });
    expect(deliveryLog.status).toBe('DELIVERED');
  });

  test('should enforce FedRAMP access controls', async () => {
    // Test with insufficient clearance
    const restrictedContext = {
      ...SECURITY_CONTEXT,
      role: 'restricted'
    };

    const testNotification: INotification = {
      id: '',
      type: NotificationType.CASE_UPDATED,
      title: 'Classified Update',
      message: 'Case details updated',
      recipientId: TEST_USER_ID,
      metadata: {
        classification: 'TOP_SECRET'
      },
      priority: NotificationPriority.HIGH,
      read: false,
      createdAt: new Date(),
      acknowledgedAt: null,
      encryptedContent: null
    };

    // Verify access control enforcement
    await expect(async () => {
      await notificationService.createNotification({
        ...testNotification,
        metadata: {
          ...testNotification.metadata,
          securityContext: restrictedContext
        }
      });
    }).rejects.toThrow(ErrorMessages[SecurityErrorCodes.INSUFFICIENT_CLEARANCE]);

    // Verify security audit
    const securityLog = await securityLogger.getAuditTrail({
      action: 'ACCESS_DENIED',
      userId: restrictedContext.userId
    });
    expect(securityLog.severity).toBe('HIGH');
  });
});