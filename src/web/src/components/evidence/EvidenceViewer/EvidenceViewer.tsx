/**
 * Secure evidence viewer component implementing FedRAMP High and CJIS compliance requirements.
 * Provides comprehensive interface for viewing and analyzing different types of evidence
 * with integrated transcription, entity detection, and annotation capabilities.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'; // v18.0.0
import classNames from 'classnames'; // v2.3.0
import { SecurityContext } from '@company/security-context'; // v1.0.0
import { AuditLogger } from '@company/audit-logger'; // v1.0.0
import { ChainOfCustody } from '@company/chain-of-custody'; // v1.0.0
import { AccessibilityProvider } from '@company/accessibility'; // v1.0.0

import { MediaPlayer } from '../MediaPlayer/MediaPlayer';
import { Evidence, SecurityClassification, EvidenceMediaType } from '../../../types/evidence.types';
import useEvidence from '../../../hooks/useEvidence';

// Security-related constants
const AUDIT_EVENTS = {
  VIEW_START: 'EVIDENCE_VIEW_START',
  VIEW_END: 'EVIDENCE_VIEW_END',
  ANNOTATION_CREATE: 'ANNOTATION_CREATE',
  HIGHLIGHT_CREATE: 'HIGHLIGHT_CREATE',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION'
} as const;

interface EvidenceViewerProps {
  evidence: Evidence;
  securityLevel: SecurityClassification;
  auditContext: {
    userId: string;
    sessionId: string;
    ipAddress: string;
  };
  custodyChain: ChainOfCustody;
  onAnnotationCreate?: (text: string, timestamp: number, note: string, securityContext: SecurityContext) => void;
  onHighlight?: (text: string, timestamp: number, securityContext: SecurityContext) => void;
  onSecurityViolation?: (violation: SecurityViolation) => void;
  className?: string;
}

interface SecurityViolation {
  code: string;
  message: string;
  timestamp: Date;
  evidenceId: string;
  userId: string;
}

/**
 * Enhanced evidence viewer component with security controls and accessibility features
 */
const EvidenceViewer: React.FC<EvidenceViewerProps> = ({
  evidence,
  securityLevel,
  auditContext,
  custodyChain,
  onAnnotationCreate,
  onHighlight,
  onSecurityViolation,
  className
}) => {
  // State management
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [annotations, setAnnotations] = useState<Array<any>>([]);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const sessionTimeoutRef = useRef<NodeJS.Timeout>();

  // Custom hooks
  const { validateSecurity, trackCustody } = useEvidence();

  /**
   * Security validation and session management
   */
  useEffect(() => {
    const validateAccess = async () => {
      try {
        const isValid = await validateSecurity(evidence);
        if (!isValid || evidence.classificationLevel > securityLevel) {
          throw new Error('Insufficient security clearance');
        }

        await trackCustody({
          evidenceId: evidence.id,
          action: AUDIT_EVENTS.VIEW_START,
          userId: auditContext.userId,
          timestamp: new Date()
        });

        setIsAuthorized(true);
        AuditLogger.log({
          eventType: AUDIT_EVENTS.VIEW_START,
          evidenceId: evidence.id,
          userId: auditContext.userId,
          sessionId: auditContext.sessionId,
          timestamp: new Date()
        });

      } catch (error) {
        const violation = {
          code: 'SECURITY_VIOLATION',
          message: error instanceof Error ? error.message : 'Security validation failed',
          timestamp: new Date(),
          evidenceId: evidence.id,
          userId: auditContext.userId
        };
        setSecurityError(violation.message);
        onSecurityViolation?.(violation);
      }
    };

    validateAccess();

    // Session timeout monitoring
    sessionTimeoutRef.current = setInterval(() => {
      validateAccess();
    }, 300000); // 5-minute revalidation

    return () => {
      if (sessionTimeoutRef.current) {
        clearInterval(sessionTimeoutRef.current);
      }
      // Log view end
      AuditLogger.log({
        eventType: AUDIT_EVENTS.VIEW_END,
        evidenceId: evidence.id,
        userId: auditContext.userId,
        sessionId: auditContext.sessionId,
        timestamp: new Date()
      });
    };
  }, [evidence, securityLevel, auditContext]);

  /**
   * Secure annotation handling
   */
  const handleAnnotation = useCallback((text: string, note: string) => {
    if (!isAuthorized) return;

    const securityContext = {
      userId: auditContext.userId,
      sessionId: auditContext.sessionId,
      clearanceLevel: securityLevel
    };

    onAnnotationCreate?.(text, currentTime, note, securityContext);

    AuditLogger.log({
      eventType: AUDIT_EVENTS.ANNOTATION_CREATE,
      evidenceId: evidence.id,
      userId: auditContext.userId,
      sessionId: auditContext.sessionId,
      timestamp: new Date(),
      details: { text, timestamp: currentTime }
    });
  }, [isAuthorized, currentTime, auditContext, evidence.id, securityLevel]);

  /**
   * Secure text selection handling
   */
  const handleTextSelection = useCallback(() => {
    if (!isAuthorized) return;

    const selection = window.getSelection();
    if (!selection) return;

    const text = selection.toString().trim();
    if (text) {
      setSelectedText(text);
      
      const securityContext = {
        userId: auditContext.userId,
        sessionId: auditContext.sessionId,
        clearanceLevel: securityLevel
      };

      onHighlight?.(text, currentTime, securityContext);

      AuditLogger.log({
        eventType: AUDIT_EVENTS.HIGHLIGHT_CREATE,
        evidenceId: evidence.id,
        userId: auditContext.userId,
        sessionId: auditContext.sessionId,
        timestamp: new Date(),
        details: { text, timestamp: currentTime }
      });
    }
  }, [isAuthorized, currentTime, auditContext, evidence.id, securityLevel]);

  // Render security error state
  if (securityError) {
    return (
      <div className="evidence-viewer-error" role="alert">
        <h3>Security Error</h3>
        <p>{securityError}</p>
      </div>
    );
  }

  // Render loading state while validating
  if (!isAuthorized) {
    return (
      <div className="evidence-viewer-loading" role="status">
        <p>Validating security clearance...</p>
      </div>
    );
  }

  return (
    <AccessibilityProvider>
      <div
        ref={viewerRef}
        className={classNames('evidence-viewer', className)}
        onMouseUp={handleTextSelection}
        role="region"
        aria-label="Evidence Viewer"
      >
        {/* Media player for audio/video evidence */}
        {(evidence.mediaType === EvidenceMediaType.AUDIO || 
          evidence.mediaType === EvidenceMediaType.VIDEO) && (
          <MediaPlayer
            evidenceId={evidence.id}
            onTimeUpdate={setCurrentTime}
            securityContext={{
              clearanceLevel: securityLevel,
              userId: auditContext.userId,
              sessionId: auditContext.sessionId
            }}
            className="evidence-viewer-media"
          />
        )}

        {/* Transcription and analysis results */}
        <div className="evidence-viewer-content">
          {evidence.metadata.transcript && (
            <div 
              className="evidence-viewer-transcript"
              role="document"
              aria-label="Evidence Transcript"
            >
              {evidence.metadata.transcript}
            </div>
          )}

          {/* Entity detection results */}
          {evidence.metadata.entities && (
            <div 
              className="evidence-viewer-entities"
              role="list"
              aria-label="Detected Entities"
            >
              {evidence.metadata.entities.map((entity, index) => (
                <div 
                  key={index}
                  className="entity-item"
                  role="listitem"
                >
                  <span className="entity-type">{entity.type}</span>
                  <span className="entity-value">{entity.value}</span>
                  <span className="entity-confidence">
                    {Math.round(entity.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Annotation interface */}
          {selectedText && (
            <div 
              className="evidence-viewer-annotation"
              role="form"
              aria-label="Create Annotation"
            >
              <textarea
                placeholder="Add annotation note..."
                aria-label="Annotation text"
                onChange={(e) => handleAnnotation(selectedText, e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Chain of custody display */}
        <div 
          className="evidence-viewer-custody"
          role="region"
          aria-label="Chain of Custody"
        >
          <h4>Chain of Custody</h4>
          {custodyChain.entries.map((entry, index) => (
            <div key={index} className="custody-entry">
              <span>{new Date(entry.timestamp).toLocaleString()}</span>
              <span>{entry.action}</span>
              <span>{entry.userId}</span>
            </div>
          ))}
        </div>
      </div>
    </AccessibilityProvider>
  );
};

export default EvidenceViewer;