/**
 * @file API Gateway entry point for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant API Gateway with comprehensive security controls
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v6.1.5
import cors from 'cors'; // v2.8.5
import compression from 'compression'; // v1.7.4
import morgan from 'morgan'; // v1.10.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0
import https from 'https';
import fs from 'fs';
import path from 'path';

import router from './routes';
import { Logger } from '../../common/utils/logger.util';
import { IErrorResponse } from '../../common/interfaces/base.interface';
import { SystemErrorCodes } from '../../common/constants/error-codes';

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || [];

// Initialize secure logger
const logger = new Logger('api-gateway', {
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  filepath: 'logs/api-gateway-%DATE%.log'
});

/**
 * Initialize Express application with FedRAMP High compliant security middleware
 */
function initializeExpress(): Express {
  const app = express();

  // Security headers middleware (FedRAMP compliance)
  app.use(helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
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
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    frameguard: { action: 'deny' }
  }));

  // CORS configuration with strict origin validation
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 600
  }));

  // Response compression
  app.use(compression());

  // Request correlation ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.headers['x-request-id']);
    next();
  });

  // CJIS compliant request logging
  app.use(morgan((tokens, req, res) => {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      responseTime: tokens['response-time'](req, res),
      userAgent: tokens['user-agent'](req, res),
      requestId: req.headers['x-request-id'],
      sourceIp: tokens['remote-addr'](req, res)
    });
  }));

  // Body parsing with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Mount main router
  app.use(router);

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date() });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    const errorResponse: IErrorResponse = {
      success: false,
      error: {
        code: SystemErrorCodes.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        timestamp: new Date(),
        source: 'api-gateway',
        details: {},
        stackTrace: NODE_ENV === 'development' ? err.stack || '' : ''
      },
      requestId: req.headers['x-request-id'] as string,
      timestamp: new Date(),
      processingTime: 0,
      auditToken: '',
      incidentId: uuidv4(),
      severity: 'ERROR'
    };

    logger.error('Unhandled error', err, {
      requestId: req.headers['x-request-id'] as string,
      userId: req.headers['x-user-id'] as string,
      sessionId: req.headers['x-session-id'] as string,
      sourceIp: req.ip
    });

    res.status(500).json(errorResponse);
  });

  return app;
}

/**
 * Start HTTPS server with FedRAMP compliant TLS configuration
 */
async function startServer(app: Express): Promise<void> {
  try {
    // Load TLS certificates
    const httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, '../certs/private.key')),
      cert: fs.readFileSync(path.join(__dirname, '../certs/certificate.crt')),
      ca: fs.readFileSync(path.join(__dirname, '../certs/ca.crt')),
      minVersion: 'TLSv1.2',
      ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
      honorCipherOrder: true,
      requestCert: true,
      rejectUnauthorized: true
    };

    const server = https.createServer(httpsOptions, app);

    // Graceful shutdown handler
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, initiating graceful shutdown', {
        requestId: uuidv4(),
        userId: 'system',
        sessionId: 'shutdown',
        sourceIp: '127.0.0.1'
      });

      server.close(() => {
        logger.info('Server shutdown complete', {
          requestId: uuidv4(),
          userId: 'system',
          sessionId: 'shutdown',
          sourceIp: '127.0.0.1'
        });
        process.exit(0);
      });
    });

    server.listen(PORT, () => {
      logger.info(`API Gateway started on port ${PORT}`, {
        requestId: uuidv4(),
        userId: 'system',
        sessionId: 'startup',
        sourceIp: '127.0.0.1'
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error as Error, {
      requestId: uuidv4(),
      userId: 'system',
      sessionId: 'startup',
      sourceIp: '127.0.0.1'
    });
    process.exit(1);
  }
}

// Initialize and start server
const app = initializeExpress();
startServer(app).catch(error => {
  logger.error('Server startup failed', error as Error, {
    requestId: uuidv4(),
    userId: 'system',
    sessionId: 'startup',
    sourceIp: '127.0.0.1'
  });
  process.exit(1);
});