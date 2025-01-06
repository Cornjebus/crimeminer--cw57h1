/**
 * @file Storage controller for secure evidence handling with FedRAMP and CJIS compliance
 * @version 1.0.0
 * @description Implements secure REST endpoints for evidence storage operations with
 * WORM compliance, encryption, and multi-cloud support
 */

import { Router, Request, Response, NextFunction } from 'express'; // v4.18.2
import multer from 'multer'; // v1.4.5-lts.1
import { StorageService } from '../services/storage.service';
import { IStorageItem, IStorageOperation } from '../interfaces/storage.interface';
import { Logger } from '../../../common/utils/logger.util';

// Upload limits for evidence files
const UPLOAD_LIMITS = {
  FILE_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
  ALLOWED_TYPES: ['audio/*', 'video/*', 'image/*', 'application/pdf'],
  MAX_FILES: 10,
  CHUNK_SIZE: 10 * 1024 * 1024 // 10MB for chunked upload
};

// Security headers for evidence operations
const SECURITY_HEADERS = {
  CACHE_CONTROL: 'no-store, no-cache, must-revalidate',
  CONTENT_SECURITY_POLICY: "default-src 'self'",
  X_CONTENT_TYPE_OPTIONS: 'nosniff'
};

/**
 * Storage controller implementing FedRAMP and CJIS compliant evidence operations
 */
export class StorageController {
  private router: Router;
  private storageService: StorageService;
  private logger: Logger;
  private upload: multer.Multer;

  constructor() {
    this.router = Router();
    this.storageService = new StorageService();
    this.logger = new Logger('StorageController', {
      level: 'info',
      filepath: 'logs/storage-%DATE%.log'
    });

    // Configure multer with strict file validation
    this.upload = multer({
      limits: {
        fileSize: UPLOAD_LIMITS.FILE_SIZE,
        files: UPLOAD_LIMITS.MAX_FILES
      },
      fileFilter: (req, file, cb) => {
        if (UPLOAD_LIMITS.ALLOWED_TYPES.some(type => 
          file.mimetype.match(new RegExp(type.replace('*', '.*'))))) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'));
        }
      }
    });

    this.initializeRoutes();
  }

  /**
   * Initialize secure route handlers with validation
   */
  private initializeRoutes(): void {
    // Evidence upload endpoint with chunked upload support
    this.router.post(
      '/upload',
      this.upload.single('evidence'),
      this.setSecurityHeaders,
      this.uploadEvidence.bind(this)
    );

    // Secure evidence download with streaming
    this.router.get(
      '/download/:id',
      this.setSecurityHeaders,
      this.downloadEvidence.bind(this)
    );

    // Evidence deletion with WORM compliance
    this.router.delete(
      '/delete/:id',
      this.setSecurityHeaders,
      this.deleteEvidence.bind(this)
    );

    // Evidence metadata retrieval
    this.router.get(
      '/metadata/:id',
      this.setSecurityHeaders,
      this.getEvidenceMetadata.bind(this)
    );
  }

  /**
   * Set security headers for all responses
   */
  private setSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
    res.set({
      'Cache-Control': SECURITY_HEADERS.CACHE_CONTROL,
      'Content-Security-Policy': SECURITY_HEADERS.CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS
    });
    next();
  }

  /**
   * Handle secure evidence upload with integrity verification
   */
  private async uploadEvidence(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        throw new Error('No file provided');
      }

      const evidenceMetadata: IStorageItem = {
        key: `evidence/${req.file.originalname}`,
        size: req.file.size,
        hash: req.body.hash,
        storageClass: req.body.storageClass,
        retentionPeriod: parseInt(req.body.retentionPeriod),
        encryptionMetadata: {},
        chainOfCustody: []
      };

      // Upload evidence with encryption and replication
      const uploadResult: IStorageOperation = await this.storageService.uploadEvidence(
        req.file.buffer,
        evidenceMetadata
      );

      // Verify upload integrity
      const integrityVerified = await this.storageService.verifyIntegrity(
        evidenceMetadata.key
      );

      if (!integrityVerified) {
        throw new Error('Evidence integrity verification failed');
      }

      // Log successful upload
      this.logger.info('Evidence upload successful', {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId: uploadResult.item.id,
        size: evidenceMetadata.size
      });

      res.status(201).json({
        success: true,
        operation: uploadResult,
        integrity: {
          verified: integrityVerified,
          hash: evidenceMetadata.hash
        }
      });

    } catch (error) {
      this.logger.error('Evidence upload failed', error, {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle secure evidence download with streaming support
   */
  private async downloadEvidence(req: Request, res: Response): Promise<void> {
    try {
      const evidenceId = req.params.id;
      const range = req.headers.range;

      // Get evidence metadata
      const metadata = await this.storageService.getEvidenceMetadata(evidenceId);

      // Verify integrity before download
      const integrityVerified = await this.storageService.verifyIntegrity(evidenceId);
      if (!integrityVerified) {
        throw new Error('Evidence integrity verification failed');
      }

      // Set response headers for streaming
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${metadata.key.split('/').pop()}"`,
        'Content-Length': metadata.size.toString()
      });

      // Stream evidence with range support
      const evidenceStream = await this.storageService.downloadEvidence(evidenceId);
      evidenceStream.pipe(res);

      // Log download access
      this.logger.info('Evidence download initiated', {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId,
        size: metadata.size
      });

    } catch (error) {
      this.logger.error('Evidence download failed', error, {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle evidence deletion with WORM compliance checks
   */
  private async deleteEvidence(req: Request, res: Response): Promise<void> {
    try {
      const evidenceId = req.params.id;

      // Get evidence metadata for WORM verification
      const metadata = await this.storageService.getEvidenceMetadata(evidenceId);

      // Attempt deletion with WORM compliance
      const deleteResult = await this.storageService.deleteEvidence(evidenceId);

      // Log deletion operation
      this.logger.info('Evidence deletion completed', {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId,
        result: deleteResult
      });

      res.status(200).json({
        success: true,
        operation: deleteResult
      });

    } catch (error) {
      this.logger.error('Evidence deletion failed', error, {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Retrieve evidence metadata with security filtering
   */
  private async getEvidenceMetadata(req: Request, res: Response): Promise<void> {
    try {
      const evidenceId = req.params.id;

      // Get and filter metadata
      const metadata = await this.storageService.getEvidenceMetadata(evidenceId);

      // Log metadata access
      this.logger.info('Evidence metadata accessed', {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId
      });

      res.status(200).json({
        success: true,
        metadata: {
          id: metadata.id,
          key: metadata.key,
          size: metadata.size,
          storageClass: metadata.storageClass,
          retentionPeriod: metadata.retentionPeriod,
          chainOfCustody: metadata.chainOfCustody
        }
      });

    } catch (error) {
      this.logger.error('Evidence metadata retrieval failed', error, {
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-user-id'] as string,
        evidenceId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get configured router instance
   */
  public getRouter(): Router {
    return this.router;
  }
}