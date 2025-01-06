/**
 * @file Notification controller implementation for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant notification controller
 * with real-time alerts, secure delivery, and audit logging
 */

import { Router, Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import { body, param, query, validationResult } from 'express-validator'; // v7.0.0
import rateLimit from 'express-rate-limit'; // v6.7.0
import winston from 'winston'; // v3.8.0
import { NotificationService } from '../services/notification.service';
import { 
  INotification, 
  NotificationType, 
  isValidNotificationType 
} from '../interfaces/notification.interface';
import { 
  HTTP_STATUS_CODES, 
  SecurityErrorCodes, 
  ErrorMessages 
} from '../../../common/constants/error-codes';
import { IBaseRequest, IErrorResponse } from '../../../common/interfaces/base.interface';

export class NotificationController {
  private readonly router: Router;
  private readonly notificationService: NotificationService;
  private readonly MAX_RETRIES = 3;
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor() {
    this.router = Router();
    this.notificationService = new NotificationService();
    this.initializeSecurityMiddleware();
    this.initializeRoutes();
  }

  private initializeSecurityMiddleware(): void {
    // Apply security headers
    this.router.use(helmet());

    // Configure rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per window
      message: ErrorMessages[SecurityErrorCodes.RATE_LIMIT_EXCEEDED],
      standardHeaders: true,
      legacyHeaders: false
    });

    this.router.use(limiter);
  }

  private initializeRoutes(): void {
    // Create notification endpoint
    this.router.post(
      '/notifications',
      [
        body('type').custom(isValidNotificationType),
        body('recipientId').isUUID(),
        body('title').isString().trim().notEmpty(),
        body('message').isString().trim().notEmpty(),
        body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
      ],
      this.createNotification.bind(this)
    );

    // Get notifications endpoint
    this.router.get(
      '/notifications',
      [
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('type').optional().custom(isValidNotificationType)
      ],
      this.getNotifications.bind(this)
    );

    // Mark notification as read endpoint
    this.router.put(
      '/notifications/:id/read',
      [param('id').isUUID()],
      this.markAsRead.bind(this)
    );
  }

  /**
   * Creates a new notification with security validation
   */
  private async createNotification(
    req: Request & IBaseRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
          success: false,
          errors: errors.array(),
          requestId: req.requestId
        });
      }

      // Create notification with security context
      const notification: INotification = {
        ...req.body,
        createdBy: req.userId,
        createdAt: new Date(),
        read: false,
        acknowledgedAt: null
      };

      const createdNotification = await this.notificationService.createNotification(notification);

      // Attempt real-time delivery
      await this.notificationService.sendNotification(createdNotification);

      return res.status(201).json({
        success: true,
        requestId: req.requestId,
        timestamp: new Date(),
        data: createdNotification
      });

    } catch (error) {
      const errorResponse: IErrorResponse = {
        success: false,
        requestId: req.requestId,
        timestamp: new Date(),
        processingTime: Date.now() - req.timestamp.getTime(),
        error: {
          code: error.code || SecurityErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message || ErrorMessages[SecurityErrorCodes.INTERNAL_SERVER_ERROR],
          details: error.details || {},
          source: 'NotificationController.createNotification',
          timestamp: new Date(),
          stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        incidentId: req.requestId,
        severity: error.severity || 'ERROR',
        auditToken: req.headers['x-audit-token'] as string
      };

      return res.status(error.status || HTTP_STATUS_CODES.INTERNAL_SERVER).json(errorResponse);
    }
  }

  /**
   * Retrieves paginated notifications with security filters
   */
  private async getNotifications(
    req: Request & IBaseRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
          success: false,
          errors: errors.array(),
          requestId: req.requestId
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const type = req.query.type as NotificationType;

      const notifications = await this.notificationService.getUserNotifications(
        req.userId,
        { page, limit, type }
      );

      return res.json({
        success: true,
        requestId: req.requestId,
        timestamp: new Date(),
        data: notifications.data,
        meta: notifications.meta
      });

    } catch (error) {
      const errorResponse: IErrorResponse = {
        success: false,
        requestId: req.requestId,
        timestamp: new Date(),
        processingTime: Date.now() - req.timestamp.getTime(),
        error: {
          code: error.code || SecurityErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message || ErrorMessages[SecurityErrorCodes.INTERNAL_SERVER_ERROR],
          details: error.details || {},
          source: 'NotificationController.getNotifications',
          timestamp: new Date(),
          stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        incidentId: req.requestId,
        severity: error.severity || 'ERROR',
        auditToken: req.headers['x-audit-token'] as string
      };

      return res.status(error.status || HTTP_STATUS_CODES.INTERNAL_SERVER).json(errorResponse);
    }
  }

  /**
   * Updates notification status with audit trail
   */
  private async markAsRead(
    req: Request & IBaseRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
          success: false,
          errors: errors.array(),
          requestId: req.requestId
        });
      }

      const notificationId = req.params.id;

      await this.notificationService.markAsRead(notificationId, req.userId);

      return res.json({
        success: true,
        requestId: req.requestId,
        timestamp: new Date(),
        data: { id: notificationId, read: true }
      });

    } catch (error) {
      const errorResponse: IErrorResponse = {
        success: false,
        requestId: req.requestId,
        timestamp: new Date(),
        processingTime: Date.now() - req.timestamp.getTime(),
        error: {
          code: error.code || SecurityErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message || ErrorMessages[SecurityErrorCodes.INTERNAL_SERVER_ERROR],
          details: error.details || {},
          source: 'NotificationController.markAsRead',
          timestamp: new Date(),
          stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        incidentId: req.requestId,
        severity: error.severity || 'ERROR',
        auditToken: req.headers['x-audit-token'] as string
      };

      return res.status(error.status || HTTP_STATUS_CODES.INTERNAL_SERVER).json(errorResponse);
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default NotificationController;