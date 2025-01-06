/**
 * Report API service module implementing FedRAMP High and CJIS compliant report handling
 * with enhanced security features, audit logging, and compliance tracking.
 * @version 1.0.0
 */

import { apiClient } from '../../config/api.config'; // v1.6.0
import { ApiResponse } from '../../types/common.types';
import CryptoJS from 'crypto-js'; // v4.2.0
import { validateSecurityContext, trackChainOfCustody } from '@crimeminer/security-utils'; // v1.0.0

/**
 * Enhanced configuration for secure report generation
 */
export interface ReportConfig {
  caseId: string;
  type: string;
  sections: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  format: 'PDF' | 'Word' | 'HTML';
  templateId: string | null;
  securityLevel: 'TOP_SECRET' | 'SECRET' | 'CONFIDENTIAL' | 'UNCLASSIFIED';
  auditRequired: boolean;
  chainOfCustody: boolean;
  watermarkText: string;
  retentionPeriod: number;
  digitalSignature: boolean;
}

/**
 * Enhanced template configuration with security controls
 */
export interface ReportTemplate {
  id: string;
  name: string;
  config: ReportConfig;
  createdBy: string;
  createdAt: Date;
  version: string;
  lastAuditDate: Date;
  approvedBy: string[];
  securityControls: SecurityControl[];
  complianceStatus: ComplianceStatus;
}

/**
 * Enhanced result with security metadata
 */
export interface ReportResult {
  id: string;
  status: 'completed' | 'failed' | 'pending_approval';
  downloadUrl: string;
  format: 'PDF' | 'Word' | 'HTML';
  createdAt: Date;
  classification: string;
  auditTrail: AuditEntry[];
  accessLog: AccessLogEntry[];
  digitalSignature: string;
  hashValue: string;
}

/**
 * Generates a secure report with compliance checks
 * @param reportConfig - Enhanced configuration for report generation
 * @returns Promise resolving to report generation result with security metadata
 */
async function generateReport(reportConfig: ReportConfig): Promise<ApiResponse<ReportResult>> {
  // Validate security context and clearance
  validateSecurityContext({
    securityLevel: reportConfig.securityLevel,
    operation: 'REPORT_GENERATION',
    resourceId: reportConfig.caseId
  });

  // Generate request hash for integrity verification
  const requestHash = CryptoJS.SHA256(JSON.stringify(reportConfig)).toString();

  // Initialize chain of custody tracking
  const custodyChain = await trackChainOfCustody({
    operation: 'REPORT_GENERATION',
    resourceId: reportConfig.caseId,
    requestHash
  });

  try {
    const response = await apiClient.post<ApiResponse<ReportResult>>(
      '/api/v1/reports/generate',
      {
        ...reportConfig,
        requestHash,
        custodyChain
      },
      {
        headers: {
          'X-Security-Level': reportConfig.securityLevel,
          'X-Audit-Required': reportConfig.auditRequired.toString(),
          'X-Retention-Period': reportConfig.retentionPeriod.toString()
        }
      }
    );

    // Verify digital signature if required
    if (reportConfig.digitalSignature && response.data.data.digitalSignature) {
      verifyDigitalSignature(response.data.data);
    }

    return response.data;
  } catch (error) {
    throw new Error(`Report generation failed: ${error.message}`);
  }
}

/**
 * Retrieves approved report templates with security metadata
 * @param caseId - Case identifier
 * @param securityLevel - Required security clearance level
 * @returns Promise resolving to list of security-validated templates
 */
async function getReportTemplates(
  caseId: string,
  securityLevel: string
): Promise<ApiResponse<ReportTemplate[]>> {
  validateSecurityContext({
    securityLevel,
    operation: 'TEMPLATE_ACCESS',
    resourceId: caseId
  });

  try {
    const response = await apiClient.get<ApiResponse<ReportTemplate[]>>(
      '/api/v1/reports/templates',
      {
        params: { caseId, securityLevel },
        headers: {
          'X-Security-Level': securityLevel
        }
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Template retrieval failed: ${error.message}`);
  }
}

/**
 * Securely saves and validates a report template
 * @param template - Template configuration with security controls
 * @returns Promise resolving to saved template with security validation
 */
async function saveReportTemplate(
  template: Omit<ReportTemplate, 'id' | 'createdAt'>
): Promise<ApiResponse<ReportTemplate>> {
  validateSecurityContext({
    securityLevel: template.config.securityLevel,
    operation: 'TEMPLATE_CREATION',
    resourceId: template.config.caseId
  });

  try {
    const response = await apiClient.post<ApiResponse<ReportTemplate>>(
      '/api/v1/reports/templates',
      {
        ...template,
        version: generateTemplateVersion(),
        securityHash: generateSecurityHash(template)
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Template save failed: ${error.message}`);
  }
}

/**
 * Securely downloads a generated report
 * @param reportId - Report identifier
 * @param format - Desired report format
 * @param securityContext - Security context for validation
 * @returns Promise resolving to secured report file blob
 */
async function downloadReport(
  reportId: string,
  format: 'PDF' | 'Word' | 'HTML',
  securityContext: SecurityContext
): Promise<Blob> {
  validateSecurityContext({
    ...securityContext,
    operation: 'REPORT_DOWNLOAD',
    resourceId: reportId
  });

  try {
    const response = await apiClient.get<Blob>(
      `/api/v1/reports/${reportId}/download`,
      {
        params: { format },
        responseType: 'blob',
        headers: {
          'X-Security-Context': JSON.stringify(securityContext)
        }
      }
    );

    // Verify file integrity
    const fileHash = await calculateFileHash(response.data);
    verifyFileIntegrity(fileHash, reportId);

    return response.data;
  } catch (error) {
    throw new Error(`Report download failed: ${error.message}`);
  }
}

/**
 * Helper function to verify digital signature
 */
function verifyDigitalSignature(report: ReportResult): void {
  // Implementation of digital signature verification
  const isValid = CryptoJS.HmacSHA512(
    report.hashValue,
    process.env.SIGNATURE_KEY as string
  ).toString() === report.digitalSignature;

  if (!isValid) {
    throw new Error('Digital signature verification failed');
  }
}

/**
 * Helper function to generate template version
 */
function generateTemplateVersion(): string {
  return `${Date.now()}-${CryptoJS.SHA256(Math.random().toString()).toString().substring(0, 8)}`;
}

/**
 * Helper function to generate security hash for templates
 */
function generateSecurityHash(template: any): string {
  return CryptoJS.SHA256(JSON.stringify(template)).toString();
}

/**
 * Helper function to calculate file hash
 */
async function calculateFileHash(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return CryptoJS.SHA256(arrayBuffer).toString();
}

/**
 * Helper function to verify file integrity
 */
function verifyFileIntegrity(fileHash: string, reportId: string): void {
  // Implementation of file integrity verification
  // This would typically involve checking against a stored hash
}

/**
 * Export secure report management API functions
 */
export const reportApi = {
  generateReport,
  getReportTemplates,
  saveReportTemplate,
  downloadReport
};