/**
 * @file Evidence REST API controller for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant evidence management with
 * enhanced security, parallel processing, and comprehensive audit logging
 */

import { controller, httpPost, httpGet, httpPatch, request, response } from 'inversify-express-utils'; // v6.4.3
import { inject } from 'inversify'; // v6.0.1
import { Request, Response } from 'express'; // v4.18.2
import multer from 'multer'; // v1.4.5-lts.1
import rateLimit from 'express-rate-limit'; // v6.7.0
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import {
  IEvidence,
  EvidenceMediaType,
  EvidenceStatus
} from '../interfaces/evidence.interface';
import { EvidenceService } from '../services/evidence.service';
import { ValidationErrorCodes } from '../../../common/constants/error-codes';

// Configure multer for secure file uploads
const upload = multer({
  limits: {
    fileSize: 1024 * 1024 * 100, // 100MB max file size
    files: 1 // Single file upload
  },
  fileFilter: (req, file, cb) => {
    // Validate file types
    const allowedTypes = [
      'audio/mpeg', 'audio/wav',
      'video/mp4', 'video/quicktime',
      'image/jpeg', 'image/png',
      'application/pdf', 'text/plain'
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error(ValidationErrorCodes.INVALID_EVIDENCE_FORMAT));
      return;
    }
    cb(null, true);
  }
});

// Rate limiting configuration
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later'
});

@controller('/api/v1/evidence')
@rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
export class EvidenceController {
  constructor(
    @inject('EvidenceService') private evidenceService: EvidenceService,
    @inject('AuditLogger') private auditLogger: AuditLogger
  ) {}

  /**
   * Upload new evidence with enhanced security and parallel processing
   * @route POST /api/v1/evidence/upload
   */
  @httpPost('/upload')
  @request()
  @response()
  public async uploadEvidence(req: Request, res: Response): Promise<IEvidence> {
    try {
      // Apply file upload middleware
      await new Promise((resolve, reject) => {
        upload.single('file')(req, res, (err) => {
          if (err) reject(err);
          resolve(true);
        });
      });

      if (!req.file) {
        throw new Error(ValidationErrorCodes.MISSING_REQUIRED_FIELD);
      }

      // Extract and validate parameters
      const { caseId, mediaType } = req.body;
      if (!caseId || !mediaType || !Object.values(EvidenceMediaType).includes(mediaType)) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Create audit log entry
      this.auditLogger.logAction({
        action: 'EVIDENCE_UPLOAD_INITIATED',
        userId: req.user?.id,
        caseId,
        metadata: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mediaType
        }
      });

      // Upload and process evidence
      const evidence = await this.evidenceService.uploadEvidence(
        req.file.buffer,
        req.file.originalname,
        caseId,
        mediaType as EvidenceMediaType
      );

      // Log successful upload
      this.auditLogger.logAction({
        action: 'EVIDENCE_UPLOAD_COMPLETED',
        userId: req.user?.id,
        caseId,
        evidenceId: evidence.id
      });

      return evidence;

    } catch (error) {
      // Log failed upload attempt
      this.auditLogger.logAction({
        action: 'EVIDENCE_UPLOAD_FAILED',
        userId: req.user?.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve evidence by ID with integrity verification
   * @route GET /api/v1/evidence/:id
   */
  @httpGet('/:id')
  @request()
  @response()
  public async getEvidence(req: Request, res: Response): Promise<{ evidence: IEvidence; data: Buffer }> {
    try {
      const { id } = req.params;

      // Log access attempt
      this.auditLogger.logAction({
        action: 'EVIDENCE_ACCESS_ATTEMPTED',
        userId: req.user?.id,
        evidenceId: id
      });

      // Retrieve evidence with integrity check
      const evidence = await this.evidenceService.getEvidence(id);

      // Verify integrity before streaming
      await this.evidenceService.verifyIntegrity(id);

      // Log successful access
      this.auditLogger.logAction({
        action: 'EVIDENCE_ACCESS_COMPLETED',
        userId: req.user?.id,
        evidenceId: id
      });

      return evidence;

    } catch (error) {
      // Log access failure
      this.auditLogger.logAction({
        action: 'EVIDENCE_ACCESS_FAILED',
        userId: req.user?.id,
        evidenceId: req.params.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve all evidence for a case
   * @route GET /api/v1/evidence/case/:caseId
   */
  @httpGet('/case/:caseId')
  @request()
  @response()
  public async getEvidenceByCaseId(req: Request, res: Response): Promise<IEvidence[]> {
    try {
      const { caseId } = req.params;

      // Log case evidence access
      this.auditLogger.logAction({
        action: 'CASE_EVIDENCE_ACCESS_ATTEMPTED',
        userId: req.user?.id,
        caseId
      });

      const evidence = await this.evidenceService.getEvidenceByCaseId(caseId);

      // Log successful access
      this.auditLogger.logAction({
        action: 'CASE_EVIDENCE_ACCESS_COMPLETED',
        userId: req.user?.id,
        caseId,
        count: evidence.length
      });

      return evidence;

    } catch (error) {
      // Log access failure
      this.auditLogger.logAction({
        action: 'CASE_EVIDENCE_ACCESS_FAILED',
        userId: req.user?.id,
        caseId: req.params.caseId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update evidence status with WORM compliance
   * @route PATCH /api/v1/evidence/:id/status
   */
  @httpPatch('/:id/status')
  @request()
  @response()
  public async updateEvidenceStatus(req: Request, res: Response): Promise<IEvidence> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !Object.values(EvidenceStatus).includes(status)) {
        throw new Error(ValidationErrorCodes.INVALID_INPUT);
      }

      // Log status update attempt
      this.auditLogger.logAction({
        action: 'EVIDENCE_STATUS_UPDATE_ATTEMPTED',
        userId: req.user?.id,
        evidenceId: id,
        newStatus: status
      });

      const evidence = await this.evidenceService.updateEvidenceStatus(id, status);

      // Log successful update
      this.auditLogger.logAction({
        action: 'EVIDENCE_STATUS_UPDATE_COMPLETED',
        userId: req.user?.id,
        evidenceId: id,
        oldStatus: evidence.status,
        newStatus: status
      });

      return evidence;

    } catch (error) {
      // Log update failure
      this.auditLogger.logAction({
        action: 'EVIDENCE_STATUS_UPDATE_FAILED',
        userId: req.user?.id,
        evidenceId: req.params.id,
        error: error.message
      });
      throw error;
    }
  }
}