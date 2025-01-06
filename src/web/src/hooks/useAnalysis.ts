/**
 * Custom React hook for managing evidence analysis operations with FedRAMP High and CJIS compliance.
 * Implements secure state management, optimized polling, and comprehensive audit logging.
 * @version 1.0.0
 */

import { useDispatch, useSelector } from 'react-redux'; // v8.1.1
import { useCallback, useEffect, useRef } from 'react'; // v18.2.0
import { useAuditLog, useRateLimit, useCircuitBreaker } from '@security/hooks'; // v1.0.0

import {
  MediaType,
  AnalysisType,
  AnalysisRequest,
  AnalysisResult,
  AnalysisStatus,
  SecurityContext,
  ComplianceStatus
} from '../types/analysis.types';

import {
  submitAnalysisRequest,
  fetchAnalysisResults,
  checkAnalysisStatus,
  validateSecurityContext
} from '../store/slices/analysis.slice';

// Constants for rate limiting and polling
const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_BATCH_SIZE = 100;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 1000;

/**
 * Custom hook for managing evidence analysis with FedRAMP compliance
 * @param securityContext - Security context for API operations
 */
export default function useAnalysis(securityContext: SecurityContext) {
  // Redux hooks
  const dispatch = useDispatch();
  const analysisState = useSelector((state: any) => state.analysis);

  // Security hooks
  const { logAuditEvent } = useAuditLog();
  const { checkRateLimit } = useRateLimit(RATE_LIMIT_WINDOW, MAX_REQUESTS_PER_WINDOW);
  const { isCircuitOpen, recordRequest } = useCircuitBreaker();

  // Refs for active polling jobs
  const activePollingJobs = useRef<Record<string, NodeJS.Timeout>>({});

  /**
   * Submit single analysis request with security validation
   */
  const submitAnalysis = useCallback(async (request: AnalysisRequest) => {
    try {
      // Security validations
      await validateSecurityContext(securityContext);
      if (isCircuitOpen()) throw new Error('Circuit breaker is open');
      if (!checkRateLimit()) throw new Error('Rate limit exceeded');

      // Submit request
      const result = await dispatch(submitAnalysisRequest({ 
        request,
        securityContext 
      })).unwrap();

      // Start polling for this job
      startPolling(result.jobId);

      // Audit logging
      await logAuditEvent({
        action: 'SUBMIT_ANALYSIS',
        entityId: request.evidenceId,
        details: { jobId: result.jobId }
      });

      return result.jobId;
    } catch (error) {
      recordRequest(false);
      throw error;
    }
  }, [securityContext, dispatch]);

  /**
   * Submit batch analysis requests with optimized processing
   */
  const submitBatchAnalysis = useCallback(async (requests: AnalysisRequest[]) => {
    if (requests.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    const jobIds: string[] = [];
    for (const request of requests) {
      try {
        const jobId = await submitAnalysis(request);
        jobIds.push(jobId);
      } catch (error) {
        // Log failure but continue processing
        await logAuditEvent({
          action: 'BATCH_ANALYSIS_ITEM_FAILED',
          entityId: request.evidenceId,
          error: error as Error
        });
      }
    }

    return jobIds;
  }, [submitAnalysis]);

  /**
   * Fetch analysis results with security checks
   */
  const getResults = useCallback(async (evidenceId: string): Promise<AnalysisResult[]> => {
    await validateSecurityContext(securityContext);
    if (!checkRateLimit()) throw new Error('Rate limit exceeded');

    const results = await dispatch(fetchAnalysisResults({
      evidenceId,
      securityContext
    })).unwrap();

    await logAuditEvent({
      action: 'FETCH_RESULTS',
      entityId: evidenceId
    });

    return results;
  }, [securityContext, dispatch]);

  /**
   * Get current status of analysis job
   */
  const getStatus = useCallback(async (jobId: string): Promise<AnalysisStatus> => {
    await validateSecurityContext(securityContext);
    if (!checkRateLimit()) throw new Error('Rate limit exceeded');

    const status = await dispatch(checkAnalysisStatus({
      jobId,
      securityContext
    })).unwrap();

    return status;
  }, [securityContext, dispatch]);

  /**
   * Start polling for job status
   */
  const startPolling = useCallback((jobId: string) => {
    if (activePollingJobs.current[jobId]) return;

    const poll = async () => {
      try {
        const status = await getStatus(jobId);
        
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          stopPolling(jobId);
          return;
        }
      } catch (error) {
        stopPolling(jobId);
        throw error;
      }
    };

    activePollingJobs.current[jobId] = setInterval(poll, POLLING_INTERVAL);
  }, [getStatus]);

  /**
   * Stop polling for job status
   */
  const stopPolling = useCallback((jobId: string) => {
    if (activePollingJobs.current[jobId]) {
      clearInterval(activePollingJobs.current[jobId]);
      delete activePollingJobs.current[jobId];
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.keys(activePollingJobs.current).forEach(jobId => {
        stopPolling(jobId);
      });
    };
  }, [stopPolling]);

  return {
    // Analysis operations
    submitAnalysis,
    submitBatchAnalysis,
    getResults,
    getStatus,
    
    // State
    isLoading: analysisState.loading,
    error: analysisState.error,
    complianceStatus: analysisState.complianceStatus
  };
}