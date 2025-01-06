/**
 * Custom React hook for secure case management operations with FedRAMP High and CJIS compliance.
 * Provides a unified interface for components to interact with case data through Redux and API.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.0.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.0
import {
  Case,
  CaseStatus,
  CaseCreateRequest,
  CaseUpdateRequest,
  CaseSecurityMetadata,
  CaseAuditLog
} from '../../types/case.types';
import {
  createCase,
  getCase,
  updateCase,
  deleteCase,
  getCases,
  validateSecurity
} from '../../services/api/case.api';
import {
  caseSlice,
  fetchCases,
  fetchCaseById,
  logAuditEvent,
  selectAllCases,
  selectSelectedCase,
  selectCaseLoading,
  selectCaseError,
  selectCasePagination,
  selectCaseSecurityMetadata,
  selectRealTimeStatus,
  setSelectedCase,
  updateRealTimeStatus,
  addAuditLog
} from '../../store/slices/case.slice';

/**
 * Interface for security validation status
 */
interface SecurityValidationStatus {
  isValid: boolean;
  level: string;
  lastChecked: Date;
  violations: string[];
}

/**
 * Interface for operation result with error handling
 */
interface Result<T, E = Error> {
  data?: T;
  error?: E;
  success: boolean;
}

/**
 * Custom hook for case management with security compliance
 */
export default function useCase() {
  const dispatch = useDispatch();

  // Redux selectors
  const cases = useSelector(selectAllCases);
  const selectedCase = useSelector(selectSelectedCase);
  const loading = useSelector(selectCaseLoading);
  const error = useSelector(selectCaseError);
  const pagination = useSelector(selectCasePagination);
  const securityMetadata = useSelector(selectCaseSecurityMetadata);
  const realTimeStatus = useSelector(selectRealTimeStatus);

  // Local state for security validation
  const [securityStatus, setSecurityStatus] = useState<SecurityValidationStatus>({
    isValid: false,
    level: 'FEDRAMP_HIGH',
    lastChecked: new Date(),
    violations: []
  });

  /**
   * Validates security requirements for case operations
   */
  const validateSecurityRequirements = useCallback(async (caseId?: string) => {
    try {
      const validationResult = await validateSecurity(caseId || '');
      setSecurityStatus({
        isValid: validationResult.isValid,
        level: validationResult.level,
        lastChecked: new Date(),
        violations: validationResult.violations
      });
      return validationResult.isValid;
    } catch (error) {
      console.error('Security validation failed:', error);
      return false;
    }
  }, []);

  /**
   * Creates a new case with security validation
   */
  const handleCreateCase = useCallback(async (data: CaseCreateRequest): Promise<Result<Case>> => {
    try {
      if (!await validateSecurityRequirements()) {
        throw new Error('Security validation failed');
      }

      const result = await createCase(data);
      dispatch(caseSlice.actions.addCase(result));
      
      // Log audit event
      dispatch(addAuditLog({
        action: 'CREATE_CASE',
        timestamp: new Date(),
        userId: localStorage.getItem('userId'),
        details: { caseId: result.id }
      }));

      return { data: result, success: true };
    } catch (error) {
      return { error: error as Error, success: false };
    }
  }, [dispatch, validateSecurityRequirements]);

  /**
   * Updates an existing case with security validation
   */
  const handleUpdateCase = useCallback(async (
    id: string,
    data: CaseUpdateRequest
  ): Promise<Result<Case>> => {
    try {
      if (!await validateSecurityRequirements(id)) {
        throw new Error('Security validation failed');
      }

      const result = await updateCase(id, data);
      dispatch(caseSlice.actions.updateCase({ id, changes: result }));
      
      dispatch(addAuditLog({
        action: 'UPDATE_CASE',
        timestamp: new Date(),
        userId: localStorage.getItem('userId'),
        details: { caseId: id, changes: data }
      }));

      return { data: result, success: true };
    } catch (error) {
      return { error: error as Error, success: false };
    }
  }, [dispatch, validateSecurityRequirements]);

  /**
   * Deletes a case with security validation
   */
  const handleDeleteCase = useCallback(async (id: string): Promise<Result<void>> => {
    try {
      if (!await validateSecurityRequirements(id)) {
        throw new Error('Security validation failed');
      }

      await deleteCase(id);
      dispatch(caseSlice.actions.removeCase(id));
      
      dispatch(addAuditLog({
        action: 'DELETE_CASE',
        timestamp: new Date(),
        userId: localStorage.getItem('userId'),
        details: { caseId: id }
      }));

      return { success: true };
    } catch (error) {
      return { error: error as Error, success: false };
    }
  }, [dispatch, validateSecurityRequirements]);

  /**
   * Fetches cases with pagination and security validation
   */
  const handleFetchCases = useCallback(async (params: {
    page: number;
    limit: number;
    status?: CaseStatus;
  }): Promise<Result<void>> => {
    try {
      if (!await validateSecurityRequirements()) {
        throw new Error('Security validation failed');
      }

      dispatch(fetchCases(params));
      return { success: true };
    } catch (error) {
      return { error: error as Error, success: false };
    }
  }, [dispatch, validateSecurityRequirements]);

  /**
   * Fetches a single case by ID with security validation
   */
  const handleFetchCaseById = useCallback(async (id: string): Promise<Result<Case>> => {
    try {
      if (!await validateSecurityRequirements(id)) {
        throw new Error('Security validation failed');
      }

      const result = await getCase(id);
      dispatch(setSelectedCase(result));
      
      dispatch(addAuditLog({
        action: 'VIEW_CASE',
        timestamp: new Date(),
        userId: localStorage.getItem('userId'),
        details: { caseId: id }
      }));

      return { data: result, success: true };
    } catch (error) {
      return { error: error as Error, success: false };
    }
  }, [dispatch, validateSecurityRequirements]);

  /**
   * Clears the selected case
   */
  const handleClearSelectedCase = useCallback(() => {
    dispatch(setSelectedCase(null));
  }, [dispatch]);

  // Return hook interface
  return {
    // State
    cases,
    selectedCase,
    loading,
    error,
    pagination,
    securityStatus,
    securityMetadata,
    realTimeStatus,

    // Actions
    createCase: handleCreateCase,
    updateCase: handleUpdateCase,
    deleteCase: handleDeleteCase,
    fetchCases: handleFetchCases,
    fetchCaseById: handleFetchCaseById,
    clearSelectedCase: handleClearSelectedCase,
    validateSecurity: validateSecurityRequirements
  };
}