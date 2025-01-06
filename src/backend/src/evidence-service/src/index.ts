/**
 * @file Entry point for CrimeMiner Evidence Service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant evidence processing service
 * with secure multi-format media handling and chain of custody tracking
 */

import 'reflect-metadata'; // Required for inversify
import express from 'express'; // v4.18.2
import { Container } from 'inversify'; // v6.0.1
import { InversifyExpressServer } from 'inversify-express-utils'; // v6.4.3
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import rateLimit from 'express-rate-limit'; // v6.9.0
import cluster from 'cluster';
import { cpus } from 'os';
import { createLogger } from '../../../common/utils/logger.util';
import { EvidenceController } from './controllers/evidence.controller';
import { EvidenceService } from './services/evidence.service';
import { StorageService } from '../../../storage-service/src/services/storage.service';

// Environment variables and constants
const PORT = process.env.PORT || 3002;
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
const NUM_WORKERS = process.env.NODE_ENV === 'production' ? cpus().length : 1;

// Initialize secure logger
const logger = createLogger('EvidenceService', {
  level: 'info',
  filepath: 'logs/evidence-service-%DATE%.log',
  maxSize: '100m',
  maxFiles: '14d',
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});

// Initialize dependency injection container
const container = new Container();

// Register service dependencies
container.bind<EvidenceService>('EvidenceService').to(EvidenceService);
container.bind<StorageService>('StorageService').to(StorageService);
container.bind<EvidenceController>('EvidenceController').to(EvidenceController);

/**
 * Configure and start the Evidence Service with security measures
 */
async function startServer(): Promise<void> {
  try {
    // Create Inversify Express server
    const server = new InversifyExpressServer(container);

    // Configure server middleware and security
    server.setConfig((app) => {
      // Basic security headers
      app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        xssFilter: true,
        noSniff: true,
        hidePoweredBy: true
      }));

      // CORS configuration with strict origin validation
      app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 600 // 10 minutes
      }));

      // Request rate limiting
      app.use(rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per window
        message: 'Too many requests from this IP, please try again later'
      }));

      // Body parsing with size limits
      app.use(express.json({ limit: '10mb' }));
      app.use(express.urlencoded({ extended: true, limit: '10mb' }));

      // Request logging with security context
      app.use((req, res, next) => {
        logger.info('Incoming request', {
          requestId: req.headers['x-request-id'] || '',
          userId: req.headers['x-user-id'] || '',
          sessionId: req.headers['x-session-id'] || '',
          sourceIp: req.ip,
          method: req.method,
          path: req.path
        });
        next();
      });
    });

    // Build and start the server
    const app = server.build();
    const httpServer = app.listen(PORT, () => {
      logger.info(`Evidence Service worker ${process.pid} started`, {
        requestId: 'STARTUP',
        userId: 'SYSTEM',
        sessionId: 'STARTUP',
        sourceIp: '127.0.0.1',
        port: PORT
      });
    });

    // Configure graceful shutdown
    configureGracefulShutdown(httpServer);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        pid: process.pid
      });
    });

  } catch (error) {
    logger.error('Failed to start Evidence Service', error, {
      requestId: 'STARTUP',
      userId: 'SYSTEM',
      sessionId: 'STARTUP',
      sourceIp: '127.0.0.1'
    });
    process.exit(1);
  }
}

/**
 * Configure graceful shutdown handling
 */
function configureGracefulShutdown(server: any): void {
  // Handle SIGTERM signal
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully', {
      requestId: 'SHUTDOWN',
      userId: 'SYSTEM',
      sessionId: 'SHUTDOWN',
      sourceIp: '127.0.0.1'
    });

    server.close(() => {
      logger.info('Server closed, exiting process', {
        requestId: 'SHUTDOWN',
        userId: 'SYSTEM',
        sessionId: 'SHUTDOWN',
        sourceIp: '127.0.0.1'
      });
      process.exit(0);
    });

    // Force shutdown if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forced shutdown initiated', new Error('Shutdown timeout'), {
        requestId: 'SHUTDOWN',
        userId: 'SYSTEM',
        sessionId: 'SHUTDOWN',
        sourceIp: '127.0.0.1'
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error, {
      requestId: 'SYSTEM',
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      sourceIp: '127.0.0.1'
    });
    process.exit(1);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason as Error, {
      requestId: 'SYSTEM',
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      sourceIp: '127.0.0.1'
    });
    process.exit(1);
  });
}

// Start server with clustering in production
if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
  logger.info('Starting Evidence Service cluster', {
    requestId: 'STARTUP',
    userId: 'SYSTEM',
    sessionId: 'STARTUP',
    sourceIp: '127.0.0.1',
    workers: NUM_WORKERS
  });

  // Fork workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  // Handle worker events
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died`, {
      requestId: 'SYSTEM',
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      sourceIp: '127.0.0.1',
      code,
      signal
    });
    // Replace dead worker
    cluster.fork();
  });
} else {
  // Start worker process
  startServer();
}