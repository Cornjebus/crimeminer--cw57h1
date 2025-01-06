/**
 * Main dashboard component implementing FedRAMP High and CJIS compliance requirements.
 * Provides secure case management interface with comprehensive audit logging.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Alert,
  Box,
  useTheme,
  useMediaQuery,
  Divider
} from '@mui/material'; // v5.0.0
import { useIdleTimer } from 'react-idle-timer'; // v5.0.0
import { useSecurityContext } from '@crimeminer/security'; // v1.0.0
import { useAuditLog } from '@crimeminer/audit-logging'; // v1.0.0
import CaseList from '../../components/case/CaseList/CaseList';
import useCase from '../../hooks/useCase';
import './Dashboard.scss';

/**
 * Security classification banner component
 */
const ClassificationBanner: React.FC = () => (
  <Box
    sx={{
      bgcolor: 'error.main',
      color: 'error.contrastText',
      py: 0.5,
      textAlign: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 1100
    }}
  >
    <Typography variant="subtitle2">
      FEDRAMP HIGH // CJIS COMPLIANT // OFFICIAL USE ONLY
    </Typography>
  </Box>
);

/**
 * Main dashboard component with security controls
 */
const Dashboard: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { logAccess, logSecurityEvent } = useAuditLog();
  const { validateSecurityContext, securityLevel } = useSecurityContext();
  const {
    cases,
    loading,
    error,
    securityStatus,
    fetchCases,
    validateSecurity
  } = useCase();

  // Local state for security status
  const [securityValidated, setSecurityValidated] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(false);

  /**
   * Handle secure session timeout
   */
  const handleOnIdle = useCallback(() => {
    setSessionTimeout(true);
    logSecurityEvent({
      action: 'SESSION_TIMEOUT',
      severity: 'HIGH',
      details: { userId: localStorage.getItem('userId') }
    });
    window.location.href = '/logout';
  }, [logSecurityEvent]);

  // Initialize idle timer for session management
  useIdleTimer({
    timeout: 1000 * 60 * 15, // 15 minutes
    onIdle: handleOnIdle,
    debounce: 500
  });

  /**
   * Handle secure case selection with audit logging
   */
  const handleCaseSelect = useCallback(async (caseId: string) => {
    try {
      const isSecure = await validateSecurity(caseId);
      if (!isSecure) {
        throw new Error('Security validation failed');
      }

      await logAccess({
        action: 'VIEW_CASE',
        entityType: 'CASE',
        entityId: caseId,
        details: { source: 'DASHBOARD' }
      });

      // Navigate to case detail (implementation depends on routing solution)
    } catch (error) {
      console.error('Case selection failed:', error);
      throw error;
    }
  }, [validateSecurity, logAccess]);

  /**
   * Initialize component with security validation
   */
  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        // Validate security context
        const contextValid = await validateSecurityContext();
        if (!contextValid) {
          throw new Error('Security context validation failed');
        }

        // Log dashboard access
        await logAccess({
          action: 'VIEW_DASHBOARD',
          entityType: 'DASHBOARD',
          entityId: 'MAIN',
          details: { securityLevel }
        });

        // Fetch initial data
        await fetchCases({
          page: 1,
          limit: 10,
          status: undefined
        });

        setSecurityValidated(true);
      } catch (error) {
        console.error('Dashboard initialization failed:', error);
        setSecurityValidated(false);
      }
    };

    initializeDashboard();

    // Prevent screen capture
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
      }
    });

    return () => {
      // Cleanup listeners
      document.removeEventListener('keydown', () => {});
    };
  }, [validateSecurityContext, logAccess, fetchCases, securityLevel]);

  // Handle security validation failure
  if (!securityValidated) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Security validation failed. Please contact your system administrator.
        </Alert>
      </Box>
    );
  }

  // Handle session timeout
  if (sessionTimeout) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Your session has expired. Please log in again.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ClassificationBanner />
      
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, overflow: 'hidden', p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h5" component="h1" gutterBottom>
                Case Management Dashboard
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Security Level: {securityLevel} | Last Validated: {securityStatus?.lastChecked?.toLocaleString()}
              </Typography>
              <Divider sx={{ my: 2 }} />
              {loading ? (
                <Typography>Securely loading cases...</Typography>
              ) : (
                <CaseList
                  onCaseSelect={handleCaseSelect}
                  securityLevel={securityLevel}
                />
              )}
            </Paper>
          </Grid>

          {!isMobile && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Security Status
                </Typography>
                <Alert severity={securityStatus?.isValid ? "success" : "error"}>
                  {securityStatus?.isValid 
                    ? "Security controls active" 
                    : "Security validation required"}
                </Alert>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>

      <Box
        component="footer"
        sx={{
          py: 1,
          px: 2,
          mt: 'auto',
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider'
        }}
      >
        <Typography variant="caption" color="text.secondary">
          OFFICIAL USE ONLY | Classification: {securityLevel} | 
          User: {localStorage.getItem('userId')} | 
          Session ID: {sessionStorage.getItem('sessionId')}
        </Typography>
      </Box>
    </Box>
  );
};

export default Dashboard;