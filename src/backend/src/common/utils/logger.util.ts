/**
 * @file Secure logging utility for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant logging with comprehensive
 * audit capabilities, secure log rotation, and SIEM integration
 */

import winston from 'winston'; // v3.11.0
import DailyRotateFile from 'winston-daily-rotate-file'; // v4.7.1
import crypto from 'crypto';
import { IBaseRequest } from '../interfaces/base.interface';
import { SystemErrorCodes } from '../constants/error-codes';

/**
 * FedRAMP compliant log levels with numeric severity
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

/**
 * Required security fields for CJIS compliance
 */
const REQUIRED_SECURITY_FIELDS = [
  'requestId',
  'userId',
  'sessionId',
  'sourceIp',
  'timestamp'
];

/**
 * Sensitive data patterns for redaction
 */
const SENSITIVE_PATTERNS = {
  password: /password[=:]\s*\S+/gi,
  token: /token[=:]\s*\S+/gi,
  ssn: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g,
  creditCard: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g
};

/**
 * Logger configuration options
 */
interface LoggerOptions {
  level?: string;
  filepath?: string;
  maxSize?: string;
  maxFiles?: string;
  syslogHost?: string;
  syslogPort?: number;
  encryptionKey?: string;
}

/**
 * FedRAMP and CJIS compliant logger implementation
 */
export class Logger {
  private winston: winston.Logger;
  private serviceName: string;
  private signer: crypto.Sign;
  private encryptionKey: Buffer;

  constructor(serviceName: string, options: LoggerOptions = {}) {
    this.serviceName = serviceName;
    this.initializeSecurity(options.encryptionKey);
    this.winston = this.createWinstonLogger(options);
  }

  /**
   * Initialize cryptographic components for log signing and encryption
   */
  private initializeSecurity(encryptionKey?: string) {
    // Generate or use provided encryption key
    this.encryptionKey = encryptionKey ? 
      Buffer.from(encryptionKey, 'base64') : 
      crypto.randomBytes(32);

    // Initialize log signer with SHA-512
    this.signer = crypto.createSign('SHA512');
  }

  /**
   * Create Winston logger with secure transports and formatting
   */
  private createWinstonLogger(options: LoggerOptions): winston.Logger {
    const {
      level = 'info',
      filepath = 'logs/crimeminer-%DATE%.log',
      maxSize = '100m',
      maxFiles = '14d',
      syslogHost,
      syslogPort
    } = options;

    // Secure file rotation transport
    const fileRotateTransport = new DailyRotateFile({
      filename: filepath,
      datePattern: 'YYYY-MM-DD',
      maxSize,
      maxFiles,
      format: this.createSecureFormat(),
      // Enable zlib compression
      zippedArchive: true,
      // Enable audit fields
      auditFile: 'logs/audit.json'
    });

    const transports: winston.transport[] = [
      fileRotateTransport,
      new winston.transports.Console({
        format: this.createSecureFormat()
      })
    ];

    // Add syslog transport if configured
    if (syslogHost && syslogPort) {
      transports.push(new winston.transports.Syslog({
        host: syslogHost,
        port: syslogPort,
        protocol: 'tls',
        format: this.createSecureFormat()
      }));
    }

    return winston.createLogger({
      level,
      transports,
      // Enable exception handling
      handleExceptions: true,
      // Enable rejection handling
      handleRejections: true
    });
  }

  /**
   * Create secure log format with required FedRAMP/CJIS fields
   */
  private createSecureFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.json(),
      winston.format((info) => {
        // Add required security fields
        info.service = this.serviceName;
        info.hostname = require('os').hostname();
        info.pid = process.pid;

        // Sign log entry
        info.signature = this.signLogEntry(info);

        return info;
      })()
    );
  }

  /**
   * Sign log entry for tamper detection
   */
  private signLogEntry(info: any): string {
    const dataToSign = JSON.stringify(info);
    this.signer.update(dataToSign);
    return this.signer.sign(this.encryptionKey).toString('base64');
  }

  /**
   * Mask sensitive data patterns
   */
  private maskSensitiveData(message: string): string {
    let maskedMessage = message;
    Object.values(SENSITIVE_PATTERNS).forEach(pattern => {
      maskedMessage = maskedMessage.replace(pattern, '[REDACTED]');
    });
    return maskedMessage;
  }

  /**
   * Validate required security fields
   */
  private validateSecurityFields(metadata: any): void {
    REQUIRED_SECURITY_FIELDS.forEach(field => {
      if (!metadata[field]) {
        throw new Error(`Missing required security field: ${field}`);
      }
    });
  }

  /**
   * Log error with enhanced security context
   */
  public error(message: string, error?: Error, metadata: Partial<IBaseRequest> = {}): void {
    this.validateSecurityFields(metadata);
    const errorInfo = {
      level: LogLevel.ERROR,
      message: this.maskSensitiveData(message),
      error: error ? {
        name: error.name,
        message: this.maskSensitiveData(error.message),
        stack: this.maskSensitiveData(error.stack || ''),
        code: error instanceof Error ? SystemErrorCodes.INTERNAL_SERVER_ERROR : undefined
      } : undefined,
      ...metadata,
      timestamp: new Date().toISOString()
    };
    this.winston.error(errorInfo);
  }

  /**
   * Log warning with security context
   */
  public warn(message: string, metadata: Partial<IBaseRequest> = {}): void {
    this.validateSecurityFields(metadata);
    this.winston.warn({
      level: LogLevel.WARN,
      message: this.maskSensitiveData(message),
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log info with security context
   */
  public info(message: string, metadata: Partial<IBaseRequest> = {}): void {
    this.validateSecurityFields(metadata);
    this.winston.info({
      level: LogLevel.INFO,
      message: this.maskSensitiveData(message),
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log debug with security context
   */
  public debug(message: string, metadata: Partial<IBaseRequest> = {}): void {
    this.validateSecurityFields(metadata);
    this.winston.debug({
      level: LogLevel.DEBUG,
      message: this.maskSensitiveData(message),
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Create logger instance with default configuration
 */
export function createLogger(serviceName: string, options?: LoggerOptions): Logger {
  return new Logger(serviceName, options);
}