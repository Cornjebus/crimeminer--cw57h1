import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames'; // v2.3.0
import { useEvidence, useAuditLog, useSecurityContext } from '@evidence/hooks'; // v1.0.0
import { SecureButton } from '../../common/Button/Button';
import styles from './TranscriptView.scss';

interface SecurityClassification {
  level: 'TOP_SECRET' | 'SECRET' | 'CONFIDENTIAL' | 'UNCLASSIFIED';
  caveats: string[];
  handlingInstructions: string[];
}

interface SecurityContext {
  userClearance: SecurityClassification;
  accessControls: AccessControl[];
  auditRequirements: AuditRequirement[];
}

interface AccessControl {
  type: 'READ' | 'WRITE' | 'ANNOTATE';
  granted: boolean;
  restrictions?: string[];
}

interface AuditRequirement {
  type: 'ACCESS' | 'MODIFICATION' | 'ANNOTATION';
  logLevel: 'INFO' | 'WARN' | 'ALERT';
}

interface ChainOfCustody {
  evidenceId: string;
  accessHistory: Array<{
    timestamp: number;
    userId: string;
    action: string;
    metadata: Record<string, unknown>;
  }>;
}

interface TranscriptLine {
  speakerId: string;
  speakerName: string;
  confidence: number;
  timestamp: number;
  text: string;
  classification: SecurityClassification;
}

interface TranscriptViewProps {
  evidence: {
    id: string;
    transcript: TranscriptLine[];
    metadata: Record<string, unknown>;
  };
  currentTime: number;
  onTimeClick: (time: number) => void;
  onAnnotationAdd: (text: string, timestamp: number, securityContext: SecurityContext) => void;
  securityClassification: SecurityClassification;
  auditContext: {
    sessionId: string;
    userId: string;
    workstationId: string;
  };
  chainOfCustody: ChainOfCustody;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({
  evidence,
  currentTime,
  onTimeClick,
  onAnnotationAdd,
  securityClassification,
  auditContext,
  chainOfCustody
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { validateAccess, logAccess } = useEvidence();
  const { logAuditEvent } = useAuditLog();
  const { securityContext } = useSecurityContext();

  // Validate user access on component mount
  useEffect(() => {
    const validateAndLogAccess = async () => {
      try {
        const hasAccess = await validateAccess(securityContext, securityClassification);
        if (!hasAccess) {
          throw new Error('Insufficient security clearance');
        }

        await logAccess({
          evidenceId: evidence.id,
          userId: auditContext.userId,
          sessionId: auditContext.sessionId,
          workstationId: auditContext.workstationId,
          action: 'VIEW_TRANSCRIPT',
          timestamp: Date.now()
        });
      } catch (error) {
        logAuditEvent({
          type: 'ACCESS_DENIED',
          severity: 'ALERT',
          details: error instanceof Error ? error.message : 'Unknown error',
          context: auditContext
        });
        throw error;
      }
    };

    validateAndLogAccess();
  }, [evidence.id, securityContext, securityClassification]);

  // Handle secure annotation creation
  const handleSecureAnnotation = useCallback(async (
    text: string,
    timestamp: number,
    context: SecurityContext
  ) => {
    try {
      const canAnnotate = context.accessControls.find(
        control => control.type === 'ANNOTATE'
      )?.granted;

      if (!canAnnotate) {
        throw new Error('Annotation permission denied');
      }

      await logAuditEvent({
        type: 'ANNOTATION_CREATED',
        severity: 'INFO',
        details: {
          evidenceId: evidence.id,
          timestamp,
          classification: securityClassification
        },
        context: auditContext
      });

      onAnnotationAdd(text, timestamp, context);
    } catch (error) {
      logAuditEvent({
        type: 'ANNOTATION_FAILED',
        severity: 'WARN',
        details: error instanceof Error ? error.message : 'Unknown error',
        context: auditContext
      });
      throw error;
    }
  }, [evidence.id, onAnnotationAdd, auditContext]);

  // Format timestamp for display
  const formatTimestamp = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Scroll to current timestamp
  useEffect(() => {
    const currentLine = containerRef.current?.querySelector(
      `[data-timestamp="${Math.floor(currentTime)}"]`
    );
    currentLine?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentTime]);

  return (
    <div 
      ref={containerRef}
      className={classNames(styles.transcriptView, styles.secureContainer)}
      data-classification={securityClassification.level}
    >
      <div className={styles.classificationBadge}>
        {securityClassification.level}
        {securityClassification.caveats.map(caveat => (
          <span key={caveat} className={styles.caveat}>{caveat}</span>
        ))}
      </div>

      {evidence.transcript.map((line, index) => (
        <div
          key={`${line.timestamp}-${index}`}
          className={styles.transcriptLine}
          data-timestamp={Math.floor(line.timestamp)}
          data-highlighted={Math.floor(currentTime) === Math.floor(line.timestamp)}
        >
          <div className={styles.speakerInfo} data-speaker-type={line.speakerId ? 'known' : 'unknown'}>
            {line.speakerName || 'Unknown Speaker'}
          </div>

          <div className={styles.transcriptContent}>
            {line.text}
          </div>

          <button
            className={styles.timestamp}
            onClick={() => onTimeClick(line.timestamp)}
            aria-label={`Jump to ${formatTimestamp(line.timestamp)}`}
          >
            {formatTimestamp(line.timestamp)}
          </button>

          <SecureButton
            variant="secondary"
            size="small"
            onClick={() => handleSecureAnnotation(
              line.text,
              line.timestamp,
              securityContext
            )}
            ariaLabel="Add annotation"
            requireConfirmation={line.classification.level === 'TOP_SECRET'}
          >
            Add Note
          </SecureButton>
        </div>
      ))}
    </div>
  );
};

export default TranscriptView;