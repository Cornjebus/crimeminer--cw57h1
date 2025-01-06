import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SecurityContext } from '@company/security-context';
import { AuditLogger } from '@company/audit-logger';
import { ReportBuilder } from '../../components/reports/ReportBuilder/ReportBuilder';
import { Alert } from '../../components/common/Alert/Alert';
import { reportApi } from '../../services/api/report.api';
import styles from './Reports.scss';

interface ReportStatus {
  reportId: string | null;
  status: 'idle' | 'validating' | 'generating' | 'completed' | 'error';
  error: string | null;
  complianceStatus: 'pending' | 'validated' | 'failed';
  auditId: string | null;
}

interface SecurityValidation {
  isValid: boolean;
  clearanceLevel: string;
  restrictions: string[];
  auditTrail: object;
}

const Reports: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [reportStatus, setReportStatus] = useState<ReportStatus>({
    reportId: null,
    status: 'idle',
    error: null,
    complianceStatus: 'pending',
    auditId: null
  });
  const [securityValidation, setSecurityValidation] = useState<SecurityValidation>({
    isValid: false,
    clearanceLevel: '',
    restrictions: [],
    auditTrail: {}
  });

  // Initialize security context and audit logging
  const { validateAccess, getCurrentUser } = React.useContext(SecurityContext);
  const auditLogger = new AuditLogger({
    component: 'Reports',
    caseId,
    userId: getCurrentUser()?.id
  });

  // Validate security context and compliance requirements
  const validateSecurity = useCallback(async () => {
    try {
      setReportStatus(prev => ({ ...prev, status: 'validating' }));

      // Validate user access and clearance
      const accessValidation = await validateAccess({
        resourceId: caseId,
        operation: 'REPORT_GENERATION',
        requiredClearance: 'SECRET'
      });

      // Validate FedRAMP and CJIS compliance
      const complianceValidation = await reportApi.validateCompliance({
        caseId,
        operation: 'REPORT_ACCESS',
        standards: ['FEDRAMP_HIGH', 'CJIS']
      });

      setSecurityValidation({
        isValid: accessValidation.isValid && complianceValidation.isValid,
        clearanceLevel: accessValidation.clearanceLevel,
        restrictions: [...accessValidation.restrictions, ...complianceValidation.restrictions],
        auditTrail: {
          ...accessValidation.auditTrail,
          ...complianceValidation.auditTrail
        }
      });

      // Log security validation
      await auditLogger.log({
        action: 'SECURITY_VALIDATION',
        outcome: accessValidation.isValid ? 'SUCCESS' : 'FAILURE',
        details: {
          clearanceLevel: accessValidation.clearanceLevel,
          complianceStatus: complianceValidation.isValid
        }
      });

      setReportStatus(prev => ({
        ...prev,
        status: 'idle',
        complianceStatus: accessValidation.isValid ? 'validated' : 'failed'
      }));

    } catch (error) {
      setReportStatus(prev => ({
        ...prev,
        status: 'error',
        error: 'Security validation failed',
        complianceStatus: 'failed'
      }));

      await auditLogger.logError({
        action: 'SECURITY_VALIDATION',
        error,
        severity: 'HIGH'
      });
    }
  }, [caseId, validateAccess, auditLogger]);

  // Handle successful report generation
  const handleReportComplete = useCallback(async (reportId: string) => {
    try {
      setReportStatus(prev => ({
        ...prev,
        reportId,
        status: 'completed',
        error: null
      }));

      // Log successful report generation
      await auditLogger.log({
        action: 'REPORT_GENERATED',
        outcome: 'SUCCESS',
        details: {
          reportId,
          caseId,
          generatedBy: getCurrentUser()?.id
        }
      });

    } catch (error) {
      await auditLogger.logError({
        action: 'REPORT_GENERATION',
        error,
        severity: 'MEDIUM'
      });
    }
  }, [caseId, auditLogger, getCurrentUser]);

  // Handle secure report download
  const handleDownload = useCallback(async (reportId: string) => {
    try {
      // Validate download permissions
      const downloadValidation = await validateAccess({
        resourceId: reportId,
        operation: 'REPORT_DOWNLOAD'
      });

      if (!downloadValidation.isValid) {
        throw new Error('Insufficient permissions for download');
      }

      // Log download attempt
      await auditLogger.log({
        action: 'REPORT_DOWNLOAD_INITIATED',
        details: { reportId }
      });

      // Download report with security context
      await reportApi.downloadReport(
        reportId,
        getCurrentUser()?.securityContext
      );

      // Log successful download
      await auditLogger.log({
        action: 'REPORT_DOWNLOADED',
        outcome: 'SUCCESS',
        details: { reportId }
      });

    } catch (error) {
      setReportStatus(prev => ({
        ...prev,
        error: 'Download failed: Insufficient permissions'
      }));

      await auditLogger.logError({
        action: 'REPORT_DOWNLOAD',
        error,
        severity: 'MEDIUM'
      });
    }
  }, [validateAccess, auditLogger, getCurrentUser]);

  // Initial security validation
  useEffect(() => {
    validateSecurity();
  }, [validateSecurity]);

  return (
    <div className={styles.reports} role="main" aria-label="Report Generation">
      {reportStatus.error && (
        <Alert
          type="error"
          dismissible
          role="alert"
          ariaLabel="Report Generation Error"
        >
          {reportStatus.error}
        </Alert>
      )}

      {securityValidation.isValid ? (
        <div className={styles.reportsContainer}>
          <header className={styles.reportsHeader}>
            <h1>Generate Report</h1>
            {securityValidation.restrictions.length > 0 && (
              <div className={styles.securityBadge} role="status">
                Classification: {securityValidation.clearanceLevel}
              </div>
            )}
          </header>

          <ReportBuilder
            caseId={caseId!}
            onComplete={handleReportComplete}
            securityLevel={securityValidation.clearanceLevel}
            complianceLevel="FEDRAMP_HIGH"
          />

          {reportStatus.reportId && (
            <div className={styles.downloadSection}>
              <button
                onClick={() => handleDownload(reportStatus.reportId!)}
                className={styles.downloadButton}
                aria-label="Download Generated Report"
              >
                Download Report
              </button>
            </div>
          )}
        </div>
      ) : (
        <Alert
          type="error"
          role="alert"
          ariaLabel="Security Validation Failed"
        >
          You do not have sufficient clearance to access report generation.
        </Alert>
      )}
    </div>
  );
};

export default Reports;