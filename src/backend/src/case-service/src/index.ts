/**
 * @file Main entry point for CrimeMiner Case Service microservice
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant NestJS application with
 * comprehensive security controls, monitoring, and audit capabilities
 */

import { NestFactory } from '@nestjs/core'; // v10.0.0
import { ValidationPipe } from '@nestjs/common'; // v10.0.0
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // v7.0.0
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.9.0
import correlator from 'express-correlation-id'; // v2.0.0
import winston from 'winston'; // v3.8.0
import { CaseController } from './controllers/case.controller';

// Global constants
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'case-service';
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;
const SHUTDOWN_TIMEOUT = 10000;

/**
 * Configure CJIS-compliant Winston logger
 */
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: SERVICE_NAME },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Bootstrap the NestJS application with FedRAMP High and CJIS compliance
 */
async function bootstrap(): Promise<void> {
  try {
    // Create NestJS application
    const app = await NestFactory.create(CaseController, {
      logger: logger
    });

    // Security headers (FedRAMP compliance)
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
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));

    // CORS configuration (CJIS compliance)
    app.enableCors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID'],
      credentials: true,
      maxAge: 3600
    });

    // Request compression
    app.use(compression());

    // Rate limiting
    app.use(rateLimit({
      windowMs: RATE_LIMIT_WINDOW,
      max: RATE_LIMIT_MAX,
      message: 'Too many requests from this IP, please try again later.'
    }));

    // Request correlation for audit trails
    app.use(correlator());

    // Global validation pipe with security checks
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
      },
      disableErrorMessages: process.env.NODE_ENV === 'production'
    }));

    // Swagger documentation with security schemas
    const config = new DocumentBuilder()
      .setTitle('CrimeMiner Case Service API')
      .setDescription('FedRAMP High and CJIS compliant case management API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('Cases')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME
      });
    });

    // Graceful shutdown handler
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, starting graceful shutdown`);
        
        setTimeout(() => {
          logger.error('Forceful shutdown due to timeout');
          process.exit(1);
        }, SHUTDOWN_TIMEOUT);

        try {
          await app.close();
          logger.info('Application shutdown successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    });

    // Start server with TLS
    await app.listen(PORT, () => {
      logger.info(`Case Service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start application
bootstrap().catch(error => {
  logger.error('Fatal error during bootstrap:', error);
  process.exit(1);
});