/**
 * Enterprise-grade utility functions for formatting data with CJIS compliance
 * and security classification support for law enforcement requirements.
 * @version 1.0.0
 */

import { BaseEntity } from '../types/common.types';
import filesize from 'filesize'; // v10.0.0
import sanitizeHtml from 'sanitize-html'; // v2.11.0
import { SecurityClassification } from '@types/security-classification'; // v1.0.0
import { AuditLogger } from 'audit-logger'; // v2.0.0

// Initialize audit logger
const auditLogger = new AuditLogger({
  service: 'format-utils',
  compliance: ['CJIS', 'FedRAMP']
});

// CJIS-compliant case number pattern
const CASE_NUMBER_PATTERN = /^[A-Z]{2}-\d{4}-\d{6}$/;

// Security classification patterns
const CLASSIFICATION_PATTERNS = {
  TOP_SECRET: '//TS//',
  SECRET: '//S//',
  CONFIDENTIAL: '//C//',
  UNCLASSIFIED: '//U//'
};

/**
 * Formats a file size with input validation and sanitization
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 * @throws Error if input is invalid
 */
export const formatFileSize = (bytes: number): string => {
  if (typeof bytes !== 'number' || bytes < 0) {
    throw new Error('Invalid file size input');
  }

  try {
    const sanitizedBytes = Math.floor(bytes);
    return filesize(sanitizedBytes, {
      base: 2,
      standard: 'jedec',
      round: 2
    });
  } catch (error) {
    auditLogger.error('File size formatting failed', { bytes, error });
    throw new Error('File size formatting failed');
  }
};

/**
 * Formats case numbers according to CJIS standards
 * @param caseId - Raw case identifier
 * @param agencyCode - Law enforcement agency code
 * @returns CJIS-compliant formatted case number
 * @throws Error if input format is invalid
 */
export const formatCaseNumber = (caseId: string, agencyCode: string): string => {
  if (!caseId || !agencyCode || agencyCode.length !== 2) {
    throw new Error('Invalid case ID or agency code');
  }

  try {
    const formattedId = `${agencyCode.toUpperCase()}-${new Date().getFullYear()}-${caseId.padStart(6, '0')}`;
    
    if (!CASE_NUMBER_PATTERN.test(formattedId)) {
      throw new Error('Invalid case number format');
    }

    auditLogger.info('Case number formatted', { caseId, agencyCode, formattedId });
    return formattedId;
  } catch (error) {
    auditLogger.error('Case number formatting failed', { caseId, agencyCode, error });
    throw error;
  }
};

/**
 * Formats evidence IDs with security classification
 * @param evidenceId - Raw evidence identifier
 * @param classification - Security classification level
 * @returns Classified and formatted evidence ID
 * @throws Error if security validation fails
 */
export const formatEvidenceId = (
  evidenceId: string,
  classification: SecurityClassification
): string => {
  if (!evidenceId || !classification) {
    throw new Error('Invalid evidence ID or classification');
  }

  try {
    const classificationMark = CLASSIFICATION_PATTERNS[classification] || CLASSIFICATION_PATTERNS.UNCLASSIFIED;
    const formattedId = `${classificationMark}EV-${evidenceId.padStart(8, '0')}`;

    auditLogger.info('Evidence ID formatted', { 
      evidenceId, 
      classification,
      formattedId: CLASSIFICATION_PATTERNS.UNCLASSIFIED + 'REDACTED'  // Log sanitized version
    });

    return formattedId;
  } catch (error) {
    auditLogger.error('Evidence ID formatting failed', { 
      evidenceId: 'REDACTED',
      classification,
      error 
    });
    throw error;
  }
};

/**
 * Formats sensitive data with security markings
 * @param data - Raw sensitive data
 * @param classification - Security classification level
 * @returns Security-marked formatted data
 * @throws Error if security requirements not met
 */
export const formatClassifiedData = (
  data: string,
  classification: SecurityClassification
): string => {
  if (!data || !classification) {
    throw new Error('Invalid data or classification');
  }

  try {
    const sanitizedData = sanitizeHtml(data, {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: 'recursiveEscape'
    });

    const classificationMark = CLASSIFICATION_PATTERNS[classification];
    const formattedData = `${classificationMark}\n${sanitizedData}\n${classificationMark}`;

    auditLogger.info('Classified data formatted', {
      classification,
      dataLength: data.length
    });

    return formattedData;
  } catch (error) {
    auditLogger.error('Classified data formatting failed', {
      classification,
      error
    });
    throw error;
  }
};

/**
 * Formats audit log entries for security events
 * @param logEntry - Raw audit log entry
 * @returns Formatted audit log entry
 * @throws Error if log entry is invalid
 */
export const formatAuditLogEntry = (logEntry: Record<string, any>): string => {
  if (!logEntry || typeof logEntry !== 'object') {
    throw new Error('Invalid audit log entry');
  }

  try {
    const timestamp = new Date().toISOString();
    const sanitizedEntry = {
      timestamp,
      operation: sanitizeHtml(logEntry.operation || ''),
      user: sanitizeHtml(logEntry.user || ''),
      resource: sanitizeHtml(logEntry.resource || ''),
      status: sanitizeHtml(logEntry.status || ''),
      details: sanitizeHtml(JSON.stringify(logEntry.details || {}))
    };

    return JSON.stringify(sanitizedEntry);
  } catch (error) {
    auditLogger.error('Audit log formatting failed', { error });
    throw error;
  }
};

// Export types for external use
export type { SecurityClassification };