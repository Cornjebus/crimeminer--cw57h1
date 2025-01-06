/**
 * @file Entry point for CrimeMiner notification service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant Express server with WebSocket support
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import http from 'http'; // v1.0.0
import helmet from 'helmet'; // v7.0.0
import cors from 'cors'; // v2.8.5
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.9.0
import { NotificationController } from './controllers/notification.controller';
import { WebSocketHandler } from './websocket/socket.handler';
import { logger } from '../../common/utils/logger.util';
import { SecurityErrorCodes, ErrorMessages } from '../../common/constants/error-codes';

// Environment variables with secure defaults
const PORT = process.env.PORT || 3004;
const HOST = process.env.HOST || '0.0.0.0';
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;

/**
 * Initialize Express server with FedRAMP and CJIS compliant security middleware
 */
function initializeServer(): Express {
  const app = express();

  // Security headers middleware
  app.use(helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
  }));

  // CORS configuration with CJIS compliance
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-audit-token'],
    exposedHeaders: ['x-request-id'],
    credentials: true,
    maxAge: 600 // 10 minutes
  }));

  // Enable secure compression
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req: Request) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, req.res as Response);
    }
  }));

  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: ErrorMessages[SecurityErrorCodes.RATE_LIMIT_EXCEEDED]
  });
  app.use(limiter);

  // Body parser with size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string;
    logger.info('Incoming request', {
      requestId,
      method: req.method,
      path: req.path,
      sourceIp: req.ip,
      userId: req.headers['x-user-id'] as string,
      sessionId: req.headers['x-session-id'] as string,
      timestamp: new Date()
    });
    next();
  });

  // Mount notification routes
  const notificationController = new NotificationController();
  app.use('/api/v1', notificationController.getRouter());

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date() });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err, {
      requestId: req.headers['x-request-id'] as string,
      userId: req.headers['x-user-id'] as string,
      sessionId: req.headers['x-session-id'] as string,
      sourceIp: req.ip,
      timestamp: new Date()
    });

    res.status(500).json({
      success: false,
      error: {
        code: SecurityErrorCodes.INTERNAL_SERVER_ERROR,
        message: ErrorMessages[SecurityErrorCodes.INTERNAL_SERVER_ERROR]
      }
    });
  });

  return app;
}

/**
 * Start HTTP and WebSocket servers with security controls
 */
async function startServer(app: Express): Promise<void> {
  try {
    const server = http.createServer(app);
    const wsHandler = WebSocketHandler.getInstance();

    // Configure WebSocket upgrade handling
    server.on('upgrade', (request: Request, socket, head) => {
      if (!wsHandler.validateUpgrade(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wsHandler.handleConnection(socket as any, request);
    });

    // Graceful shutdown handler
    process.on('SIGTERM', () => handleGracefulShutdown(server));
    process.on('SIGINT', () => handleGracefulShutdown(server));

    // Start server
    server.listen(PORT, HOST, () => {
      logger.info('Server started', {
        requestId: 'server-start',
        port: PORT,
        host: HOST,
        userId: 'system',
        sessionId: 'system',
        sourceIp: HOST,
        timestamp: new Date()
      });
    });

  } catch (error) {
    logger.error('Server startup failed', error as Error, {
      requestId: 'server-start',
      userId: 'system',
      sessionId: 'system',
      sourceIp: HOST,
      timestamp: new Date()
    });
    process.exit(1);
  }
}

/**
 * Handle graceful server shutdown
 */
function handleGracefulShutdown(server: http.Server): void {
  logger.info('Initiating graceful shutdown', {
    requestId: 'server-shutdown',
    userId: 'system',
    sessionId: 'system',
    sourceIp: HOST,
    timestamp: new Date()
  });

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', err, {
        requestId: 'server-shutdown',
        userId: 'system',
        sessionId: 'system',
        sourceIp: HOST,
        timestamp: new Date()
      });
      process.exit(1);
    }

    logger.info('Server shutdown complete', {
      requestId: 'server-shutdown',
      userId: 'system',
      sessionId: 'system',
      sourceIp: HOST,
      timestamp: new Date()
    });
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout', new Error('Shutdown timeout'), {
      requestId: 'server-shutdown',
      userId: 'system',
      sessionId: 'system',
      sourceIp: HOST,
      timestamp: new Date()
    });
    process.exit(1);
  }, 10000);
}

// Start server
const app = initializeServer();
startServer(app).catch((error) => {
  logger.error('Fatal server error', error as Error, {
    requestId: 'server-start',
    userId: 'system',
    sessionId: 'system',
    sourceIp: HOST,
    timestamp: new Date()
  });
  process.exit(1);
});