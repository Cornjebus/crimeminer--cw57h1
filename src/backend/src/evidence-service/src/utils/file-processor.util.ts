/**
 * CJIS-compliant file processing utility for CrimeMiner platform
 * Implements secure evidence ingestion, validation and storage
 * @module file-processor.util
 * @version 1.0.0
 */

import { IEvidence, EvidenceMediaType, IEvidenceMetadata } from '../interfaces/evidence.interface';
import { encrypt } from '../../../common/utils/encryption.util';
import { ValidationErrorCodes, SecurityErrorCodes } from '../../../common/constants/error-codes';
import ffmpeg from 'fluent-ffmpeg'; // v2.1.2
import sharp from 'sharp'; // v0.32.4
import mime from 'mime-types'; // v2.1.35
import { S3, KMS } from 'aws-sdk'; // v2.1450.0
import winston from 'winston'; // v3.10.0
import { createHash } from 'crypto';

// Initialize AWS clients with retry configuration
const s3 = new S3({ apiVersion: '2006-03-01', maxRetries: 3 });
const kms = new KMS({ apiVersion: '2014-11-01', maxRetries: 3 });

// Configure CJIS-compliant logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'file-processor' },
  transports: [
    new winston.transports.File({ filename: 'evidence-processing.log' })
  ]
});

// Global constants
const ALLOWED_MIME_TYPES = {
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  VIDEO: ['video/mp4', 'video/mpeg', 'video/quicktime'],
  IMAGE: ['image/jpeg', 'image/png', 'image/tiff'],
  TEXT: ['text/plain', 'application/pdf', 'application/msword']
};

const MAX_FILE_SIZE = 5368709120; // 5GB
const S3_BUCKET = 'evidence-storage';
const KMS_KEY_ID = 'evidence-encryption-key';
const RETRY_CONFIG = { maxAttempts: 3, backoff: 'exponential' };

/**
 * Processes uploaded evidence file with CJIS compliance
 * @param fileData - Raw file buffer
 * @param fileName - Original file name
 * @param mediaType - Type of media being processed
 * @param userId - ID of user processing the file
 * @returns Processed file details with audit trail
 */
export async function processFile(
  fileData: Buffer,
  fileName: string,
  mediaType: EvidenceMediaType,
  userId: string
): Promise<{
  filePath: string;
  fileHash: string;
  metadata: IEvidenceMetadata;
  auditTrail: string;
}> {
  const auditTrail: string[] = [];
  const logEntry = (action: string) => {
    const entry = `${new Date().toISOString()} - ${action} - User: ${userId}`;
    auditTrail.push(entry);
    logger.info(entry);
  };

  try {
    logEntry('Starting file processing');

    // Validate file
    const validationResult = await validateFile(fileData, mime.lookup(fileName) || '', mediaType);
    if (!validationResult.isValid) {
      throw new Error(validationResult.error);
    }
    logEntry('File validation completed');

    // Extract metadata
    const metadata = await extractMetadata(fileData, mediaType, userId);
    logEntry('Metadata extraction completed');

    // Generate SHA-512 hash
    const fileHash = createHash('sha512').update(fileData).digest('hex');
    logEntry(`File hash generated: ${fileHash}`);

    // Encrypt file using HSM-backed keys
    const encryptedData = await encrypt(fileData, KMS_KEY_ID, {
      userId,
      mediaType,
      fileHash
    });
    logEntry('File encryption completed');

    // Generate S3 path with WORM compliance
    const s3Path = `${mediaType.toLowerCase()}/${new Date().getFullYear()}/${fileHash}`;

    // Upload to S3 with WORM policy
    await s3.putObject({
      Bucket: S3_BUCKET,
      Key: s3Path,
      Body: encryptedData.encryptedData,
      Metadata: {
        iv: encryptedData.iv.toString('base64'),
        tag: encryptedData.tag.toString('base64'),
        keyVersion: encryptedData.keyVersion,
        originalHash: fileHash
      },
      ObjectLockMode: 'GOVERNANCE',
      ObjectLockRetentionMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years
    }).promise();
    logEntry('File uploaded to secure storage');

    // Verify upload integrity
    const uploadedObject = await s3.getObject({
      Bucket: S3_BUCKET,
      Key: s3Path
    }).promise();

    if (uploadedObject.Metadata?.originalHash !== fileHash) {
      throw new Error(SecurityErrorCodes.INTEGRITY_CHECK_FAILED);
    }
    logEntry('Upload integrity verified');

    return {
      filePath: s3Path,
      fileHash,
      metadata,
      auditTrail: auditTrail.join('\n')
    };

  } catch (error) {
    logger.error('File processing failed', { error, userId, fileName });
    throw error;
  }
}

/**
 * Extracts and validates metadata with chain of custody tracking
 * @param fileData - Raw file buffer
 * @param mediaType - Type of media
 * @param userId - ID of user processing the file
 * @returns Validated metadata with chain of custody
 */
export async function extractMetadata(
  fileData: Buffer,
  mediaType: EvidenceMediaType,
  userId: string
): Promise<IEvidenceMetadata> {
  const baseMetadata: Partial<IEvidenceMetadata> = {
    fileSize: fileData.length,
    mimeType: '',
    encoding: 'utf-8',
    securityHash: createHash('sha512').update(fileData).digest('hex')
  };

  try {
    switch (mediaType) {
      case EvidenceMediaType.AUDIO:
        return new Promise((resolve, reject) => {
          ffmpeg.ffprobe(fileData, (err, metadata) => {
            if (err) reject(err);
            resolve({
              ...baseMetadata,
              mimeType: metadata.format.format_name,
              duration: metadata.format.duration,
              encoding: metadata.format.format_name
            } as IEvidenceMetadata);
          });
        });

      case EvidenceMediaType.VIDEO:
        return new Promise((resolve, reject) => {
          ffmpeg.ffprobe(fileData, (err, metadata) => {
            if (err) reject(err);
            resolve({
              ...baseMetadata,
              mimeType: metadata.format.format_name,
              duration: metadata.format.duration,
              dimensions: {
                width: metadata.streams[0].width,
                height: metadata.streams[0].height
              },
              encoding: metadata.format.format_name
            } as IEvidenceMetadata);
          });
        });

      case EvidenceMediaType.IMAGE:
        const imageMetadata = await sharp(fileData).metadata();
        return {
          ...baseMetadata,
          mimeType: imageMetadata.format || '',
          dimensions: {
            width: imageMetadata.width || 0,
            height: imageMetadata.height || 0
          },
          encoding: imageMetadata.format || ''
        } as IEvidenceMetadata;

      case EvidenceMediaType.TEXT:
        return {
          ...baseMetadata,
          mimeType: mime.lookup(fileData.toString().slice(0, 100)) || 'text/plain',
          encoding: 'utf-8'
        } as IEvidenceMetadata;

      default:
        throw new Error(ValidationErrorCodes.INVALID_EVIDENCE_FORMAT);
    }
  } catch (error) {
    logger.error('Metadata extraction failed', { error, userId, mediaType });
    throw error;
  }
}

/**
 * Performs comprehensive file validation with security checks
 * @param fileData - Raw file buffer
 * @param mimeType - MIME type of file
 * @param mediaType - Type of media
 * @returns Validation results
 */
async function validateFile(
  fileData: Buffer,
  mimeType: string,
  mediaType: EvidenceMediaType
): Promise<{ isValid: boolean; error?: string }> {
  // Check file size
  if (fileData.length > MAX_FILE_SIZE) {
    return { isValid: false, error: 'File size exceeds maximum allowed' };
  }

  // Validate MIME type
  const allowedTypes = ALLOWED_MIME_TYPES[mediaType];
  if (!allowedTypes.includes(mimeType)) {
    return { isValid: false, error: ValidationErrorCodes.INVALID_FORMAT };
  }

  // Additional format-specific validation
  try {
    switch (mediaType) {
      case EvidenceMediaType.AUDIO:
      case EvidenceMediaType.VIDEO:
        await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(fileData, (err) => {
            if (err) reject(ValidationErrorCodes.INVALID_EVIDENCE_FORMAT);
            resolve(true);
          });
        });
        break;

      case EvidenceMediaType.IMAGE:
        await sharp(fileData).metadata();
        break;

      case EvidenceMediaType.TEXT:
        if (!fileData.toString('utf-8').length) {
          return { isValid: false, error: ValidationErrorCodes.INVALID_FORMAT };
        }
        break;
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}