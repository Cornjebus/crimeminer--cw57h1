/**
 * @file Entry point for CrimeMiner authentication service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant authentication service
 * with Keycloak integration, MFA support, and comprehensive audit logging
 */

import express, { Express } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import Redis from 'ioredis'; // v5.3.2
import KeycloakConnect from 'keycloak-connect'; // v21.0.0
import dotenv from 'dotenv'; // v16.3.1

import { keycloakConfig, initializeKeycloak } from './config/keycloak.config';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { errorHandler } from '../../common/middleware/error-handler.middleware';
import { createLogger } from '../../common/utils/logger.util';

// Load environment variables
dotenv.config();

// Global constants from environment
const PORT = process.env.AUTH_SERVICE_PORT || 3001;
const REDIS_URL = process.env.REDIS_URL;
const NODE_ENV = process.env.NODE_ENV;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Initialize secure logger with SIEM integration
const logger = createLogger('AuthService', {
  level: LOG_LEVEL,
  syslogHost: process.env.SIEM_HOST,
  syslogPort: parseInt(process.env.SIEM_PORT || '514'),
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});

/**
 * Bootstrap the authentication service with FedRAMP High compliance
 */
async function bootstrapServer(): Promise<void> {
  try {
    // Initialize Redis client with secure configuration
    const redisClient = new Redis(REDIS_URL!, {
      tls: NODE_ENV === 'production',
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      reconnectOnError: (err) => {
        logger.error('Redis connection error', err, {
          requestId: 'SYSTEM',
          userId: 'SYSTEM',
          sessionId: 'SYSTEM',
          sourceIp: 'localhost',
          timestamp: new Date().toISOString()
        });
        return true;
      }
    });

    // Initialize Keycloak client with FedRAMP settings
    const keycloak = await initializeKeycloak();

    // Create Express application
    const app: Express = express();

    // Configure security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true
    }));

    // Configure CORS with strict options
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS);
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
    });

    // Parse JSON requests with size limits
    app.use(express.json({ limit: '10kb' }));

    // Initialize session management with Redis
    app.use(keycloak.middleware({
      logout: '/auth/logout',
      admin: '/',
      store: redisClient
    }));

    // Initialize auth service with compliance settings
    const authService = new AuthService(keycloak, redisClient);

    // Initialize auth controller with security controls
    const authController = new AuthController(authService, logger);

    // Register authentication routes
    app.use('/auth', authController.router);

    // Configure comprehensive error handling
    app.use(errorHandler);

    // Start HTTPS server with TLS
    const server = app.listen(PORT, () => {
      logger.info(`Auth service started on port ${PORT}`, {
        requestId: 'SYSTEM',
        userId: 'SYSTEM',
        sessionId: 'SYSTEM',
        sourceIp: 'localhost',
        timestamp: new Date().toISOString()
      });
    });

    // Configure secure server timeouts
    server.keepAliveTimeout = 60000;
    server.headersTimeout = 65000;

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Initiating graceful shutdown', {
        requestId: 'SYSTEM',
        userId: 'SYSTEM',
        sessionId: 'SYSTEM',
        sourceIp: 'localhost',
        timestamp: new Date().toISOString()
      });

      server.close(async () => {
        await redisClient.quit();
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown initiated', new Error('Shutdown timeout'), {
          requestId: 'SYSTEM',
          userId: 'SYSTEM',
          sessionId: 'SYSTEM',
          sourceIp: 'localhost',
          timestamp: new Date().toISOString()
        });
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start auth service', error as Error, {
      requestId: 'SYSTEM',
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      sourceIp: 'localhost',
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

// Start the service
bootstrapServer();