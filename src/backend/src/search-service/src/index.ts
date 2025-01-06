/**
 * @file Entry point for CrimeMiner search service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant search service with
 * comprehensive security controls, rate limiting, and monitoring
 */

import express, { Express } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.1.0
import cors from 'cors'; // v2.8.5
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v7.1.5
import { SearchController } from './controllers/search.controller';
import { elasticsearchConfig, createElasticsearchClient } from './config/elasticsearch.config';
import { Logger } from '../../common/utils/logger.util';
import { errorHandler } from '../../common/middleware/error-handler.middleware';

// Environment variables with defaults
const PORT = process.env.PORT || 3005;
const NODE_ENV = process.env.NODE_ENV || 'development';
const RATE_LIMIT_WINDOW = Number(process.env.RATE_LIMIT_WINDOW) || 3600000; // 1 hour
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 1000;
const RATE_LIMIT_BURST = Number(process.env.RATE_LIMIT_BURST) || 2000;

// Initialize secure logger
const logger = new Logger('SearchService', {
  level: 'info',
  filepath: 'logs/search-service-%DATE%.log',
  syslogHost: process.env.SIEM_HOST,
  syslogPort: parseInt(process.env.SIEM_PORT || '514')
});

/**
 * Initialize Express application with FedRAMP and CJIS compliant settings
 */
function initializeApp(): Express {
  const app = express();

  // Security middleware configuration
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
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'same-origin' },
    noSniff: true,
    xssFilter: true
  }));

  // CORS configuration with CJIS compliance
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://crimeminer.gov'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 600 // 10 minutes
  }));

  // Enable gzip compression
  app.use(compression());

  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    burst: RATE_LIMIT_BURST,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
  });

  app.use(limiter);

  // Body parser with size limits
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      if (buf.length > 10 * 1024 * 1024) {
        throw new Error('Request payload too large');
      }
    }
  }));

  // Request tracking middleware
  app.use((req, res, next) => {
    req.startTime = Date.now();
    req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
    next();
  });

  // Health check endpoints
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health/deep', async (req, res) => {
    try {
      const esClient = createElasticsearchClient();
      const health = await esClient.cluster.health();
      res.json({
        status: 'ok',
        elasticsearch: health.status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: 'Elasticsearch health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // API routes
  const searchController = new SearchController();
  app.use('/api/v1/search', searchController.router);

  // Error handling
  app.use(errorHandler);

  return app;
}

/**
 * Start server with security checks and graceful shutdown
 */
async function startServer(app: Express): Promise<void> {
  try {
    // Verify Elasticsearch connection
    const esClient = createElasticsearchClient();
    await esClient.ping();
    logger.info('Elasticsearch connection verified');

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Search service started on port ${PORT} in ${NODE_ENV} mode`);
    });

    // Graceful shutdown handler
    const shutdown = async () => {
      logger.info('Shutting down search service...');
      
      server.close(async () => {
        try {
          await esClient.close();
          logger.info('Search service shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error as Error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start search service', error as Error);
    process.exit(1);
  }
}

// Start application
if (require.main === module) {
  const app = initializeApp();
  startServer(app).catch((error) => {
    logger.error('Fatal error during startup', error as Error);
    process.exit(1);
  });
}

export { initializeApp, startServer };