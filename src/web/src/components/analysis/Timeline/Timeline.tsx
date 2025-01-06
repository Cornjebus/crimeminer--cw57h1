/**
 * Timeline component for visualizing evidence analysis events with FedRAMP High and CJIS compliance.
 * Implements secure event visualization with comprehensive audit logging and access controls.
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'; // v18.2.0
import { Timeline as VisTimeline } from 'vis-timeline'; // v7.7.0
import { format } from 'date-fns'; // v2.30.0

import {
  AnalysisResult,
  AnalysisStatus,
  AnalysisType,
  SecurityContext,
  ComplianceValidation
} from '../../../types/analysis.types';

import {
  useAnalysis,
  useSecurityContext,
  useAuditLog
} from '../../../hooks/useAnalysis';

// Timeline configuration with security and compliance settings
const TIMELINE_OPTIONS = {
  minHeight: '200px',
  maxHeight: '800px',
  zoomMin: 3600000, // 1 hour minimum zoom
  zoomMax: 31536000000, // 1 year maximum zoom
  stack: true,
  showCurrentTime: true,
  multiselect: false,
  clickToUse: true,
  orientation: 'top',
  verticalScroll: true,
  horizontalScroll: true,
  zoomKey: 'ctrlKey',
  tooltip: {
    followMouse: true,
    overflowMethod: 'cap'
  },
  onInitialDrawComplete: () => {
    // Log initial render for audit
    console.log('Timeline initialized');
  }
};

// Security classification levels
const SECURITY_LEVELS = {
  UNCLASSIFIED: 0,
  CONFIDENTIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3
} as const;

interface TimelineProps {
  evidenceId: string;
  securityContext: SecurityContext;
  onEventClick?: (eventId: string) => void;
}

/**
 * Timeline component that visualizes evidence analysis events with security controls
 */
const TimelineComponent: React.FC<TimelineProps> = ({
  evidenceId,
  securityContext,
  onEventClick
}) => {
  // Refs
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<VisTimeline | null>(null);

  // State
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Hooks
  const { getResults, getStatus } = useAnalysis(securityContext);
  const { validateAccess } = useSecurityContext();
  const { logTimelineEvent } = useAuditLog();

  /**
   * Process analysis results into secure timeline events
   */
  const processAnalysisEvents = useCallback(async (results: AnalysisResult[]) => {
    try {
      // Validate security context before processing
      await validateAccess(securityContext, 'VIEW_TIMELINE');

      return results.map(result => ({
        id: `${result.evidenceId}-${result.resultType}`,
        content: getEventContent(result),
        start: new Date(result.processingTime),
        type: 'box',
        className: `timeline-event security-level-${result.securityClassification}`,
        group: result.resultType,
        title: getEventTooltip(result),
        securityLevel: result.securityClassification,
        complianceStatus: result.complianceStatus
      }));
    } catch (error) {
      setError('Security validation failed');
      return [];
    }
  }, [securityContext, validateAccess]);

  /**
   * Initialize timeline with security controls
   */
  useEffect(() => {
    const initializeTimeline = async () => {
      try {
        // Validate security context
        await validateAccess(securityContext, 'INIT_TIMELINE');

        // Fetch analysis results
        const results = await getResults(evidenceId);
        const events = await processAnalysisEvents(results);

        // Create timeline instance with security options
        if (timelineContainerRef.current && !timelineInstanceRef.current) {
          timelineInstanceRef.current = new VisTimeline(
            timelineContainerRef.current,
            events,
            TIMELINE_OPTIONS
          );

          // Add secure event handlers
          timelineInstanceRef.current.on('select', (properties) => {
            handleTimelineClick(properties);
          });

          // Log initialization
          await logTimelineEvent({
            action: 'TIMELINE_INITIALIZED',
            evidenceId,
            userId: securityContext.userId
          });
        }

        setTimelineData(events);
      } catch (error) {
        setError('Failed to initialize timeline');
        await logTimelineEvent({
          action: 'TIMELINE_INIT_ERROR',
          evidenceId,
          error: error as Error
        });
      }
    };

    initializeTimeline();

    // Cleanup
    return () => {
      if (timelineInstanceRef.current) {
        timelineInstanceRef.current.destroy();
        timelineInstanceRef.current = null;
      }
    };
  }, [evidenceId, securityContext]);

  /**
   * Handle timeline event clicks with security validation
   */
  const handleTimelineClick = async (properties: any) => {
    try {
      const eventId = properties.items[0];
      if (!eventId) return;

      // Validate access for clicked event
      const event = timelineData.find(e => e.id === eventId);
      if (!event) return;

      await validateAccess(securityContext, 'VIEW_EVENT', {
        securityLevel: event.securityLevel,
        complianceStatus: event.complianceStatus
      });

      // Log interaction
      await logTimelineEvent({
        action: 'EVENT_CLICKED',
        evidenceId,
        eventId,
        userId: securityContext.userId
      });

      setSelectedEvent(eventId);
      onEventClick?.(eventId);
    } catch (error) {
      setError('Access denied to event');
      await logTimelineEvent({
        action: 'EVENT_ACCESS_DENIED',
        evidenceId,
        error: error as Error
      });
    }
  };

  /**
   * Generate secure event content with classification indicators
   */
  const getEventContent = (result: AnalysisResult): string => {
    const classification = `[${result.securityClassification}]`;
    const type = result.resultType;
    const confidence = `${Math.round(result.confidence * 100)}%`;
    return `${classification} ${type} (${confidence})`;
  };

  /**
   * Generate secure event tooltip with compliance status
   */
  const getEventTooltip = (result: AnalysisResult): string => {
    return `
      Type: ${result.resultType}
      Classification: ${result.securityClassification}
      Compliance: ${result.complianceStatus}
      Confidence: ${Math.round(result.confidence * 100)}%
      Time: ${format(new Date(result.processingTime), 'PPpp')}
    `;
  };

  // Render timeline container with error handling
  return (
    <div className="timeline-wrapper">
      {error && (
        <div className="timeline-error" role="alert">
          {error}
        </div>
      )}
      <div
        ref={timelineContainerRef}
        className="timeline-container"
        data-testid="evidence-timeline"
      />
    </div>
  );
};

export default TimelineComponent;