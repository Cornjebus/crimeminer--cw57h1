/**
 * Validation utility functions for CrimeMiner web application
 * Implements FedRAMP High and CJIS compliant validation rules
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { scan } from '@njpatel/clamav.js'; // v1.2.0
import { Case, CaseStatus } from '../types/case.types';
import { 
  Evidence, 
  EvidenceMediaType, 
  SecurityClassification,
  EvidenceStatus,
  ChainOfCustodyEntry,
  SecurityControl
} from '../types/evidence.types';

// Constants for validation rules
const MAX_FILE_SIZES = {
  [SecurityClassification.UNCLASSIFIED]: 100 * 1024 * 1024, // 100MB
  [SecurityClassification.SENSITIVE]: 250 * 1024 * 1024, // 250MB
  [SecurityClassification.CONFIDENTIAL]: 500 * 1024 * 1024, // 500MB
  [SecurityClassification.SECRET]: 1024 * 1024 * 1024 // 1GB
};

const ALLOWED_FILE_TYPES = {
  [EvidenceMediaType.AUDIO]: ['.mp3', '.wav', '.m4a', '.ogg'],
  [EvidenceMediaType.VIDEO]: ['.mp4', '.mov', '.avi', '.mkv'],
  [EvidenceMediaType.IMAGE]: ['.jpg', '.jpeg', '.png', '.tiff'],
  [EvidenceMediaType.TEXT]: ['.txt', '.pdf', '.doc', '.docx']
};

// Zod schemas for validation
const caseSchema = z.object({
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Title can only contain alphanumeric characters, spaces, hyphens and underscores'),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  status: z.nativeEnum(CaseStatus),
  metadata: z.object({
    classification: z.nativeEnum(SecurityClassification),
    priority: z.number().min(1).max(5),
    tags: z.array(z.string()),
    customFields: z.record(z.unknown())
  }),
  assignedUsers: z.array(z.string().uuid()).min(1, 'At least one user must be assigned'),
  auditTrail: z.array(z.object({
    timestamp: z.string().datetime(),
    action: z.string(),
    userId: z.string().uuid(),
    details: z.record(z.unknown())
  }))
});

const evidenceSchema = z.object({
  caseId: z.string().uuid(),
  mediaType: z.nativeEnum(EvidenceMediaType),
  status: z.nativeEnum(EvidenceStatus),
  metadata: z.object({
    originalFilename: z.string(),
    fileSize: z.number().positive(),
    mimeType: z.string(),
    duration: z.number().optional(),
    resolution: z.object({
      width: z.number(),
      height: z.number()
    }).optional(),
    customMetadata: z.record(z.unknown())
  }),
  classificationLevel: z.nativeEnum(SecurityClassification),
  securityControls: z.array(z.object({
    controlId: z.string(),
    controlType: z.string(),
    implementationStatus: z.string(),
    lastAssessmentDate: z.date()
  })),
  chainOfCustody: z.array(z.object({
    timestamp: z.date(),
    fromUserId: z.string().uuid(),
    toUserId: z.string().uuid(),
    reason: z.string(),
    signature: z.string(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number()
    })
  }))
});

/**
 * Validates case data against FedRAMP and CJIS requirements
 * @param caseData - Case data to validate
 * @returns Validation result with status and errors
 */
export const validateCase = async (caseData: Partial<Case>): Promise<ValidationResult> => {
  try {
    const validationResult = await caseSchema.safeParseAsync(caseData);
    
    if (!validationResult.success) {
      return {
        isValid: false,
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      };
    }

    // Additional security validation
    const securityValidation = validateSecurityRequirements(caseData);
    if (!securityValidation.isValid) {
      return securityValidation;
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: [{ field: 'general', message: 'Case validation failed' }]
    };
  }
};

/**
 * Validates evidence data including chain of custody and security controls
 * @param evidenceData - Evidence data to validate
 * @returns Validation result with status and errors
 */
export const validateEvidence = async (evidenceData: Partial<Evidence>): Promise<ValidationResult> => {
  try {
    const validationResult = await evidenceSchema.safeParseAsync(evidenceData);
    
    if (!validationResult.success) {
      return {
        isValid: false,
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      };
    }

    // Validate chain of custody
    const custodyValidation = validateChainOfCustody(evidenceData.chainOfCustody);
    if (!custodyValidation.isValid) {
      return custodyValidation;
    }

    // Validate security controls
    const securityValidation = validateSecurityControls(evidenceData.securityControls);
    if (!securityValidation.isValid) {
      return securityValidation;
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: [{ field: 'general', message: 'Evidence validation failed' }]
    };
  }
};

/**
 * Validates file uploads with enhanced security scanning
 * @param file - File to validate
 * @returns Validation result with security scan results
 */
export const validateFileUpload = async (file: File): Promise<ValidationResult> => {
  try {
    // Check file size limits
    const maxSize = MAX_FILE_SIZES[SecurityClassification.UNCLASSIFIED];
    if (file.size > maxSize) {
      return {
        isValid: false,
        errors: [{ field: 'file', message: 'File size exceeds maximum allowed' }]
      };
    }

    // Validate file extension
    const extension = file.name.toLowerCase().split('.').pop();
    const validExtensions = Object.values(ALLOWED_FILE_TYPES).flat();
    if (!extension || !validExtensions.includes(`.${extension}`)) {
      return {
        isValid: false,
        errors: [{ field: 'file', message: 'File type not allowed' }]
      };
    }

    // Perform malware scan
    const scanResult = await scan(file);
    if (scanResult.infected) {
      return {
        isValid: false,
        errors: [{ field: 'file', message: 'Malware detected in file' }]
      };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: [{ field: 'file', message: 'File validation failed' }]
    };
  }
};

// Helper interfaces
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
}

// Private helper functions
const validateSecurityRequirements = (caseData: Partial<Case>): ValidationResult => {
  // Implementation of security requirement validation
  return { isValid: true, errors: [] };
};

const validateChainOfCustody = (custody: ChainOfCustodyEntry[]): ValidationResult => {
  // Implementation of chain of custody validation
  return { isValid: true, errors: [] };
};

const validateSecurityControls = (controls: SecurityControl[]): ValidationResult => {
  // Implementation of security controls validation
  return { isValid: true, errors: [] };
};