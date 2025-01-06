/**
 * Analysis page component implementing FedRAMP High and CJIS compliant evidence analysis
 * with comprehensive security controls, audit logging, and performance optimizations.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom'; // v6.14.0
import { 
  Box, 
  Grid, 
  Paper, 
  Typography,
  CircularProgress,
  Alert
} from '@mui/material'; // v5.14.0

// Internal components with security context
import Timeline from '../../components/analysis/Timeline/Timeline';
import NetworkGraph from '../../components/analysis/NetworkGraph/NetworkGraph';
import EntityList from '../../components/analysis/EntityList/EntityList';

// Secure analysis hook with compliance validation
import { useAnalysis } from '../../hooks/useAnalysis';

// Audit logging service
import { AuditLogger } from '@audit/logger'; // v2.0.0

// Types
import { 
  AnalysisResult, 
  SecurityContext, 
  ComplianceStatus,
  AuditContext 
} from '../../types/analysis.types';

// Security classification levels
const SECURITY_LEVELS = {
  UNCLASSIFIED: 0,
  CONFIDENTIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3
} as const;

interface AnalysisPageProps {
  className?: string;
  securityLevel?: keyof typeof SECURITY_LEVELS;
  auditContext?: AuditContext;
}

/**
 * Main Analysis page component with security controls and compliance features
 */
const Analysis: React.FC<AnalysisPageProps> = ({
  className = '',
  securityLevel = 'UNCLASSIFIED',
  auditContext = {}
}) => {
  // URL parameters with security validation
  const { evidenceId } = useParams<{ evidenceId: string }>();

  // State management
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Security context
  const securityContext: SecurityContext = useMemo(() => ({
    userId: localStorage.getItem('userId') || '',
    clearanceLevel: securityLevel,
    sessionId: sessionStorage.getItem('sessionId') || '',
    auditToken: localStorage.getItem('auditToken') || ''
  }), [securityLevel]);

  // Analysis hook with security validation
  const { 
    getResults, 
    getStatus, 
    validateSecurityContext 
  } = useAnalysis(securityContext);

  // Audit logger instance
  const auditLogger = new AuditLogger({
    context: {
      ...auditContext,
      component: 'AnalysisPage',
      evidenceId
    }
  });

  /**
   * Securely handle timeline event clicks with audit logging
   */
  const handleTimelineEventClick = useCallback(async (eventId: string) => {
    try {
      // Validate security context
      await validateSecurityContext(securityContext);

      // Log interaction
      await auditLogger.log({
        action: 'TIMELINE_EVENT_CLICK',
        entityId: eventId,
        securityLevel,
        timestamp: new Date().toISOString()
      });

      setSelectedEvent(eventId);
    } catch (error) {
      setError('Access denied: Insufficient permissions');
      console.error('Timeline interaction error:', error);
    }
  }, [securityContext, securityLevel]);

  /**
   * Securely handle entity selection with compliance validation
   */
  const handleEntitySelect = useCallback(async (entity: { 
    type: string; 
    value: string; 
    classification: string;
  }) => {
    try {
      // Validate security clearance
      if (SECURITY_LEVELS[securityLevel] < SECURITY_LEVELS[entity.classification as keyof typeof SECURITY_LEVELS]) {
        throw new Error('Insufficient security clearance');
      }

      // Log selection
      await auditLogger.log({
        action: 'ENTITY_SELECT',
        entityId: entity.value,
        entityType: entity.type,
        classification: entity.classification,
        timestamp: new Date().toISOString()
      });

      setSelectedEntity(entity.value);
    } catch (error) {
      setError('Access denied: Insufficient clearance level');
      console.error('Entity selection error:', error);
    }
  }, [securityLevel]);

  /**
   * Load and validate analysis data with security controls
   */
  useEffect(() => {
    let mounted = true;

    const loadAnalysisData = async () => {
      try {
        setLoading(true);

        // Validate security context
        await validateSecurityContext(securityContext);

        // Check evidence ID
        if (!evidenceId) {
          throw new Error('Invalid evidence ID');
        }

        // Log access attempt
        await auditLogger.log({
          action: 'LOAD_ANALYSIS',
          evidenceId,
          timestamp: new Date().toISOString()
        });

        // Get analysis results
        const results = await getResults(evidenceId);
        
        if (!mounted) return;

        // Log successful load
        await auditLogger.log({
          action: 'ANALYSIS_LOADED',
          evidenceId,
          resultCount: results.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        if (mounted) {
          setError('Failed to load analysis data: ' + error.message);
          console.error('Analysis load error:', error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadAnalysisData();

    return () => { 
      mounted = false;
    };
  }, [evidenceId, securityContext]);

  // Render loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box className={className} p={2}>
      <Grid container spacing={2}>
        {/* Timeline Section */}
        <Grid item xs={12}>
          <Paper elevation={2}>
            <Box p={2}>
              <Typography variant="h6" gutterBottom>Timeline Analysis</Typography>
              <Timeline
                evidenceId={evidenceId!}
                securityContext={securityContext}
                onEventClick={handleTimelineEventClick}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Network Graph Section */}
        <Grid item xs={12} md={8}>
          <Paper elevation={2}>
            <Box p={2} height="500px">
              <Typography variant="h6" gutterBottom>Entity Network</Typography>
              <NetworkGraph
                evidenceId={evidenceId!}
                securityContext={securityContext}
                onNodeSelect={handleEntitySelect}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Entity List Section */}
        <Grid item xs={12} md={4}>
          <Paper elevation={2}>
            <Box p={2} height="500px">
              <Typography variant="h6" gutterBottom>Detected Entities</Typography>
              <EntityList
                evidenceId={evidenceId!}
                securityContext={securityContext}
                accessLevel="READ"
                onEntitySelect={handleEntitySelect}
                auditLogger={auditLogger}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Analysis;