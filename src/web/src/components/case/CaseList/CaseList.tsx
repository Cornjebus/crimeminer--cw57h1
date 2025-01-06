/**
 * CaseList component implementing FedRAMP High and CJIS compliant case browsing.
 * Provides secure case listing with comprehensive audit logging and access controls.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  Chip,
  IconButton,
  Typography,
  Box,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { ErrorBoundary } from '@sentry/react'; // v7.0.0
import { useAudit } from '@company/audit-logger'; // v1.0.0
import { Case, CaseStatus, SecurityClassification } from '../../../types/case.types';
import useCase from '../../../hooks/useCase';

/**
 * Props interface for CaseList component
 */
interface CaseListProps {
  onCaseSelect?: (caseId: string) => void;
  securityLevel?: SecurityClassification;
}

/**
 * Secure case list component with FedRAMP and CJIS compliance
 */
const CaseList: React.FC<CaseListProps> = ({ onCaseSelect, securityLevel = 'FEDRAMP_HIGH' }) => {
  // Hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { logAccess } = useAudit();
  const {
    cases,
    loading,
    error,
    pagination,
    securityStatus,
    fetchCases,
    validateSecurity,
    subscribeToUpdates
  } = useCase();

  // Local state
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  /**
   * Securely handles page changes with audit logging
   */
  const handlePageChange = useCallback(async (event: unknown, newPage: number) => {
    try {
      // Validate security context before page change
      const isSecure = await validateSecurity();
      if (!isSecure) {
        throw new Error('Security validation failed');
      }

      // Log page access attempt
      await logAccess({
        action: 'CASE_LIST_PAGE_CHANGE',
        entityType: 'CASE_LIST',
        entityId: 'ALL',
        details: { page: newPage }
      });

      setPage(newPage);
      await fetchCases({
        page: newPage,
        limit: pagination.limit,
        status: undefined
      });
    } catch (error) {
      console.error('Page change failed:', error);
      // Error handling will be caught by ErrorBoundary
      throw error;
    }
  }, [validateSecurity, logAccess, fetchCases, pagination.limit]);

  /**
   * Handles secure sorting with audit logging
   */
  const handleSort = useCallback(async (field: string) => {
    try {
      // Validate sort permission
      const isSecure = await validateSecurity();
      if (!isSecure) {
        throw new Error('Security validation failed');
      }

      // Log sort attempt
      await logAccess({
        action: 'CASE_LIST_SORT',
        entityType: 'CASE_LIST',
        entityId: 'ALL',
        details: { field, direction: sortDirection === 'asc' ? 'desc' : 'asc' }
      });

      setSortField(field);
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } catch (error) {
      console.error('Sort operation failed:', error);
      throw error;
    }
  }, [validateSecurity, logAccess, sortDirection]);

  /**
   * Handles secure case selection with audit logging
   */
  const handleCaseSelect = useCallback(async (caseId: string) => {
    try {
      // Validate selection permission
      const isSecure = await validateSecurity(caseId);
      if (!isSecure) {
        throw new Error('Security validation failed');
      }

      // Log case access
      await logAccess({
        action: 'CASE_SELECT',
        entityType: 'CASE',
        entityId: caseId,
        details: { source: 'CASE_LIST' }
      });

      onCaseSelect?.(caseId);
    } catch (error) {
      console.error('Case selection failed:', error);
      throw error;
    }
  }, [validateSecurity, logAccess, onCaseSelect]);

  // Initialize component with security validation
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        // Validate initial security context
        const isSecure = await validateSecurity();
        if (!isSecure) {
          throw new Error('Security validation failed');
        }

        // Set up real-time updates
        await subscribeToUpdates();

        // Fetch initial data
        await fetchCases({
          page,
          limit: pagination.limit,
          status: undefined
        });

        // Log component initialization
        await logAccess({
          action: 'CASE_LIST_INIT',
          entityType: 'CASE_LIST',
          entityId: 'ALL',
          details: { securityLevel }
        });
      } catch (error) {
        console.error('Component initialization failed:', error);
        throw error;
      }
    };

    initializeComponent();
  }, [validateSecurity, subscribeToUpdates, fetchCases, logAccess, page, pagination.limit, securityLevel]);

  // Render loading state
  if (loading) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography>Loading cases securely...</Typography>
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box sx={{ p: 2, color: 'error.main' }}>
        <Typography>Error: {error}</Typography>
      </Box>
    );
  }

  return (
    <ErrorBoundary fallback={<Typography color="error">Error loading case list</Typography>}>
      <Box sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
          <Table stickyHeader aria-label="secure case list">
            <TableHead>
              <TableRow>
                <TableCell onClick={() => handleSort('title')}>
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableCell>
                {!isMobile && (
                  <>
                    <TableCell>Status</TableCell>
                    <TableCell>Security Level</TableCell>
                    <TableCell onClick={() => handleSort('updatedAt')}>
                      Last Updated {sortField === 'updatedAt' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.map((case_) => (
                <TableRow
                  key={case_.id}
                  onClick={() => handleCaseSelect(case_.id)}
                  sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                >
                  <TableCell>
                    <Typography variant="body1">{case_.title}</Typography>
                  </TableCell>
                  {!isMobile && (
                    <>
                      <TableCell>
                        <Chip
                          label={case_.status}
                          color={case_.status === CaseStatus.ACTIVE ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={case_.securityLevel}
                          color={case_.securityLevel === 'CJIS' ? 'error' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(case_.updatedAt).toLocaleDateString()}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={Math.ceil(pagination.total / pagination.limit)}
            page={page}
            onChange={handlePageChange}
            color="primary"
            size={isMobile ? 'small' : 'medium'}
          />
        </Box>
      </Box>
    </ErrorBoundary>
  );
};

export default CaseList;