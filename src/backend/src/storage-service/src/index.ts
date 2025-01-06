/**
 * @file Storage service entry point with FedRAMP High and CJIS compliance
 * @version 1.0.0
 * @description Initializes secure storage service with multi-cloud support,
 * comprehensive monitoring, and audit logging capabilities
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import cors from 'cors'; // v2.8.5
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v7.1.0
import { StorageController } from './controllers/storage.controller';
import { storageConfig } from './config/storage.config';
import { Logger } from '../../common/utils/logger.util';

// Initialize secure logger
const logger = new Logger('StorageService', {
  level: 'info',
  filepath: 'logs/storage-%DATE%.log',
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});

// Server port configuration
const PORT: number = parseInt(process.env.PORT || '3005', 10);

// CORS configuration with strict origin policy
const CORS_OPTIONS = {
  origin: ['https://*.crimeminer.gov'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  maxAge: 86400,
  credentials: true
};

// Helmet security configuration
const HELMET_CONFIG = {
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true
};

/**
 * Initialize Express server with FedRAMP and CJIS compliant security controls
 */
function initializeServer(): Express {
  const app = express();

  // Apply security middleware
  app.use(helmet(HELMET_CONFIG));
  app.use(cors(CORS_OPTIONS));
  app.use(compression());

  // Configure JSON parsing with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Apply rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later'
  }));

  // Add request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info('Incoming request', {
      requestId: req.headers['x-request-id'] as string,
      userId: req.headers['x-user-id'] as string,
      method: req.method,
      path: req.path,
      sourceIp: req.ip,
      sessionId: req.headers['x-session-id'] as string,
      timestamp: new Date().toISOString()
    });
    next();
  });

  // Initialize storage controller
  const storageController = new StorageController();

  // Mount storage routes
  app.use('/api/v1/storage', storageController.getRouter());

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err, {
      requestId: req.headers['x-request-id'] as string,
      userId: req.headers['x-user-id'] as string,
      sourceIp: req.ip,
      sessionId: req.headers['x-session-id'] as string,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      requestId: req.headers['x-request-id']
    });
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

/**
 * Start storage service with security validation
 */
async function startServer(app: Express): Promise<void> {
  try {
    // Validate storage configuration
    if (!storageConfig.primaryStorage || !storageConfig.backupStorage) {
      throw new Error('Invalid storage configuration');
    }

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info('Storage service started', {
        requestId: 'system',
        userId: 'system',
        port: PORT,
        environment: process.env.NODE_ENV,
        sourceIp: '127.0.0.1',
        sessionId: 'system',
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    logger.error('Failed to start storage service', error, {
      requestId: 'system',
      userId: 'system',
      sourceIp: '127.0.0.1',
      sessionId: 'system',
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

// Initialize and start server
const app = initializeServer();
startServer(app).catch(error => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, initiating graceful shutdown', {
    requestId: 'system',
    userId: 'system',
    sourceIp: '127.0.0.1',
    sessionId: 'system',
    timestamp: new Date().toISOString()
  });
  process.exit(0);
});