/**
 * Main evidence page component implementing FedRAMP High and CJIS compliance requirements.
 * Provides comprehensive interface for viewing, analyzing, and managing digital evidence
 * with complete chain of custody tracking and audit logging.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { useParams, useNavigate } from 'react-router-dom'; // v6.11.0
import { useDispatch } from 'react-redux'; // v8.1.0
import { SecurityContext } from '@company/security-context'; // v1.0.0
import { AuditLogger } from '@company/audit-logger'; // v1.0.0

import EvidenceViewer from '../../components/evidence/EvidenceViewer/EvidenceViewer';
import useEvidence from '../../hooks/useEvidence';
import { Evidence as EvidenceType, SecurityClassification } from '../../types/evidence.types';

// Security-related constants
const AUDIT_EVENTS = {
  PAGE_VIEW: 'EVIDENCE_PAGE_VIEW',
  ANNOTATION_CREATE: 'EVIDENCE_ANNOTATION_CREATE',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  ACCESS_DENIED: 'ACCESS_DENIED'
} as const;

interface EvidencePageProps {
  className?: string;
  securityContext: SecurityContext;
  auditLogger: typeof AuditLogger;
}

/**
 * Main evidence page component with comprehensive security controls
 */
const Evidence: React.FC<EvidencePageProps> = ({
  className,
  securityContext,
  auditLogger
}) => {
  // Router hooks
  const { evidenceId } = useParams<{ evidenceId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // State management
  const [evidence, setEvidence] = useState<EvidenceType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [securityViolation, setSecurityViolation] = useState<string | null>(null);

  // Custom hooks
  const {
    getEvidence,
    validateSecurity,
    trackCustody,
    error: evidenceError
  } = useEvidence();

  /**
   * Initializes evidence page with security validation
   */
  useEffect(() => {
    const initializeEvidence = async () => {
      if (!evidenceId) {
        setError('Evidence ID is required');
        return;
      }

      try {
        setLoading(true);

        // Log page access attempt
        await auditLogger.log({
          eventType: AUDIT_EVENTS.PAGE_VIEW,
          evidenceId,
          userId: securityContext.userId,
          timestamp: new Date(),
          details: {
            clearanceLevel: securityContext.clearanceLevel
          }
        });

        // Fetch evidence with security validation
        const evidenceData = await getEvidence(evidenceId);
        
        // Validate security clearance
        const hasAccess = await validateSecurity(evidenceData);
        if (!hasAccess) {
          throw new Error('Insufficient security clearance');
        }

        // Update chain of custody
        await trackCustody({
          evidenceId,
          action: 'VIEW',
          userId: securityContext.userId,
          timestamp: new Date()
        });

        setEvidence(evidenceData);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load evidence';
        setSecurityViolation(errorMessage);
        
        await auditLogger.log({
          eventType: AUDIT_EVENTS.SECURITY_VIOLATION,
          evidenceId,
          userId: securityContext.userId,
          timestamp: new Date(),
          error: errorMessage
        });

        navigate('/access-denied');
      } finally {
        setLoading(false);
      }
    };

    initializeEvidence();

    // Cleanup and session monitoring
    return () => {
      auditLogger.log({
        eventType: 'EVIDENCE_PAGE_EXIT',
        evidenceId,
        userId: securityContext.userId,
        timestamp: new Date()
      });
    };
  }, [evidenceId, securityContext]);

  /**
   * Handles secure annotation creation with audit logging
   */
  const handleAnnotationCreate = useCallback(async (
    text: string,
    timestamp: number,
    note: string
  ) => {
    try {
      // Validate security context
      if (!securityContext.clearanceLevel) {
        throw new Error('Invalid security context');
      }

      // Create annotation with security metadata
      const annotationData = {
        text,
        timestamp,
        note,
        evidenceId,
        userId: securityContext.userId,
        clearanceLevel: securityContext.clearanceLevel,
        created: new Date()
      };

      // Log annotation creation
      await auditLogger.log({
        eventType: AUDIT_EVENTS.ANNOTATION_CREATE,
        evidenceId,
        userId: securityContext.userId,
        timestamp: new Date(),
        details: annotationData
      });

      // Update chain of custody
      await trackCustody({
        evidenceId,
        action: 'ANNOTATION_ADDED',
        userId: securityContext.userId,
        timestamp: new Date(),
        details: { annotationId: annotationData.timestamp }
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create annotation';
      setError(errorMessage);
      
      await auditLogger.log({
        eventType: AUDIT_EVENTS.SECURITY_VIOLATION,
        evidenceId,
        userId: securityContext.userId,
        timestamp: new Date(),
        error: errorMessage
      });
    }
  }, [evidenceId, securityContext, auditLogger]);

  // Handle security violations
  if (securityViolation) {
    return (
      <div className="evidence-security-error" role="alert">
        <h2>Security Violation</h2>
        <p>{securityViolation}</p>
      </div>
    );
  }

  // Handle loading state
  if (loading) {
    return (
      <div className="evidence-loading" role="status">
        <p>Validating security clearance...</p>
      </div>
    );
  }

  // Handle error state
  if (error || evidenceError) {
    return (
      <div className="evidence-error" role="alert">
        <h2>Error</h2>
        <p>{error || evidenceError}</p>
      </div>
    );
  }

  // Render main evidence viewer with security controls
  return (
    <div 
      className={`evidence-page ${className || ''}`}
      role="main"
      aria-label="Evidence Viewer"
    >
      {evidence && (
        <EvidenceViewer
          evidence={evidence}
          securityContext={securityContext}
          onAnnotationCreate={handleAnnotationCreate}
          onSecurityViolation={async (violation) => {
            setSecurityViolation(violation.message);
            await auditLogger.log({
              eventType: AUDIT_EVENTS.SECURITY_VIOLATION,
              evidenceId,
              userId: securityContext.userId,
              timestamp: new Date(),
              details: violation
            });
          }}
        />
      )}
    </div>
  );
};

export default Evidence;