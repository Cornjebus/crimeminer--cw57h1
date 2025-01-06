/**
 * Main page component for case management implementing FedRAMP High and CJIS compliance.
 * Provides secure case listing and details with comprehensive audit logging.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Grid, Box, Alert } from '@mui/material'; // v5.0.0
import { useAuditLog } from '@crimeminer/audit-logging'; // v1.0.0

import CaseList from '../../components/case/CaseList/CaseList';
import CaseDetails from '../../components/case/CaseDetails/CaseDetails';
import useCase from '../../hooks/useCase';
import { Case } from '../../types/case.types';

/**
 * Interface for Cases component props with security context
 */
interface CasesProps {
  securityContext: {
    userId: string;
    securityLevel: string;
    permissions: string[];
  };
}

/**
 * Main Cases page component with FedRAMP and CJIS compliance
 */
const Cases: React.FC<CasesProps> = ({ securityContext }) => {
  // Hooks
  const {
    cases,
    loading,
    selectedCase,
    fetchCases,
    subscribeToUpdates,
    realTimeStatus
  } = useCase();

  const { logAccess } = useAuditLog();

  // Local state
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Securely handles case selection with audit logging
   */
  const handleCaseSelect = useCallback(async (caseId: string) => {
    try {
      // Log case access attempt
      await logAccess({
        action: 'CASE_ACCESS',
        entityType: 'CASE',
        entityId: caseId,
        userId: securityContext.userId,
        securityLevel: securityContext.securityLevel,
        timestamp: new Date()
      });

      setSelectedCaseId(caseId);
      setShowDetails(true);
    } catch (error) {
      console.error('Case selection failed:', error);
      setError('Failed to access case. Please verify your security clearance.');
    }
  }, [logAccess, securityContext]);

  /**
   * Handles closing case details with cleanup
   */
  const handleDetailsClose = useCallback(async () => {
    try {
      if (selectedCaseId) {
        await logAccess({
          action: 'CASE_CLOSE',
          entityType: 'CASE',
          entityId: selectedCaseId,
          userId: securityContext.userId,
          securityLevel: securityContext.securityLevel,
          timestamp: new Date()
        });
      }

      setSelectedCaseId(null);
      setShowDetails(false);
    } catch (error) {
      console.error('Error closing case details:', error);
    }
  }, [selectedCaseId, logAccess, securityContext]);

  // Initialize component with security validation
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        // Log component initialization
        await logAccess({
          action: 'CASES_PAGE_ACCESS',
          entityType: 'PAGE',
          entityId: 'CASES',
          userId: securityContext.userId,
          securityLevel: securityContext.securityLevel,
          timestamp: new Date()
        });

        // Set up real-time updates
        await subscribeToUpdates();

        // Fetch initial cases
        await fetchCases({
          page: 1,
          limit: 10,
          status: undefined
        });
      } catch (error) {
        console.error('Component initialization failed:', error);
        setError('Failed to initialize case management. Please try again.');
      }
    };

    initializeComponent();
  }, [fetchCases, subscribeToUpdates, logAccess, securityContext]);

  return (
    <Box sx={{ flexGrow: 1, height: '100%', overflow: 'hidden' }}>
      {error && (
        <Alert 
          severity="error" 
          onClose={() => setError(null)}
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {!realTimeStatus.connected && (
        <Alert 
          severity="warning" 
          sx={{ mb: 2 }}
        >
          Real-time updates are currently unavailable
        </Alert>
      )}

      <Grid container spacing={2} sx={{ height: 'calc(100% - 48px)' }}>
        {/* Case List Section */}
        <Grid item xs={12} md={showDetails ? 6 : 12}>
          <CaseList
            onCaseSelect={handleCaseSelect}
            securityLevel={securityContext.securityLevel}
          />
        </Grid>

        {/* Case Details Section */}
        {showDetails && selectedCaseId && (
          <Grid item xs={12} md={6}>
            <CaseDetails
              caseId={selectedCaseId}
              onClose={handleDetailsClose}
              securityContext={securityContext}
            />
          </Grid>
        )}
      </Grid>

      {/* Security Classification Banner */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          p: 1,
          textAlign: 'center',
          zIndex: 1000
        }}
      >
        {securityContext.securityLevel} - FOR OFFICIAL USE ONLY
      </Box>
    </Box>
  );
};

export default Cases;