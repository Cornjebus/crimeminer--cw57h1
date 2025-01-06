/**
 * Enhanced authentication hook implementing FedRAMP High and CJIS compliant
 * authentication flows with comprehensive security validation and compliance monitoring.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.1
import {
  LoginRequest,
  LoginResponse,
  User,
  AuthState,
  SecurityContext,
  ComplianceStatus
} from '../../types/auth.types';
import {
  authActions,
} from '../../store/slices/auth.slice';
import AuthApi from '../../services/api/auth.api';

// Security validation intervals
const TOKEN_REFRESH_INTERVAL = 300000; // 5 minutes
const SECURITY_VALIDATION_INTERVAL = 60000; // 1 minute
const MAX_MFA_ATTEMPTS = 3;
const COMPLIANCE_CHECK_INTERVAL = 900000; // 15 minutes

/**
 * Enhanced authentication hook with FedRAMP and CJIS compliance
 */
export const useAuth = () => {
  // Local state management
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaAttempts, setMfaAttempts] = useState<number>(0);
  const [securityContext, setSecurityContext] = useState<SecurityContext>({
    lastValidated: new Date(),
    complianceStatus: 'COMPLIANT',
    securityIncidents: [],
    activeThreats: []
  });

  // Redux state management
  const dispatch = useDispatch();
  const {
    isAuthenticated,
    user,
    mfaRequired,
    complianceViolations
  } = useSelector((state: { auth: AuthState }) => state.auth);

  /**
   * Enhanced login with security validation and compliance tracking
   */
  const login = useCallback(async (credentials: LoginRequest): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Generate security context
      const loginContext = {
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        ipAddress: window.location.hostname,
        userAgent: navigator.userAgent
      };

      // Attempt login with security context
      const response = await AuthApi.login(credentials, loginContext);

      // Handle MFA requirement
      if (response.mfaRequired) {
        dispatch(authActions.setMfaRequired(true));
        return;
      }

      // Validate security clearance
      const clearanceValid = await AuthApi.validateSecurityClearance(
        response.user.securityClearance
      );
      if (!clearanceValid) {
        throw new Error('Invalid security clearance');
      }

      // Check compliance status
      const complianceStatus = await AuthApi.checkComplianceStatus(response.user.id);
      dispatch(authActions.updateComplianceStatus(complianceStatus));

      // Log security event
      await AuthApi.logSecurityEvent({
        type: 'AUTH_SUCCESS',
        userId: response.user.id,
        context: loginContext
      });

      dispatch(authActions.loginSuccess(response));

    } catch (error: any) {
      setError(error.message);
      dispatch(authActions.loginFailure(error.message));
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  /**
   * Enhanced MFA verification with FIPS compliance
   */
  const verifyMfa = useCallback(async (mfaCode: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Check MFA attempts
      if (mfaAttempts >= MAX_MFA_ATTEMPTS) {
        throw new Error('Maximum MFA attempts exceeded');
      }

      // Generate security context
      const mfaContext = {
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        attemptNumber: mfaAttempts + 1
      };

      // Verify MFA
      const response = await AuthApi.verifyMfa(mfaCode, mfaContext);

      // Validate security clearance
      const clearanceValid = await AuthApi.validateSecurityClearance(
        response.user.securityClearance
      );
      if (!clearanceValid) {
        throw new Error('Invalid security clearance');
      }

      // Log successful MFA
      await AuthApi.logSecurityEvent({
        type: 'MFA_SUCCESS',
        userId: response.user.id,
        context: mfaContext
      });

      dispatch(authActions.mfaSuccess(response));
      setMfaAttempts(0);

    } catch (error: any) {
      setMfaAttempts(prev => prev + 1);
      setError(error.message);
      dispatch(authActions.mfaFailure(error.message));
    } finally {
      setLoading(false);
    }
  }, [dispatch, mfaAttempts]);

  /**
   * Secure logout with audit logging
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);

      // Generate security context
      const logoutContext = {
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        sessionDuration: user ? Date.now() - new Date(user.lastLogin).getTime() : 0
      };

      await AuthApi.logout(logoutContext);
      dispatch(authActions.logout());

      // Log logout event
      await AuthApi.logSecurityEvent({
        type: 'LOGOUT',
        userId: user?.id,
        context: logoutContext
      });

    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [dispatch, user]);

  /**
   * Continuous security context validation
   */
  const validateSecurityContext = useCallback(async (): Promise<void> => {
    try {
      // Validate security clearance
      if (user) {
        const clearanceValid = await AuthApi.validateSecurityClearance(
          user.securityClearance
        );
        if (!clearanceValid) {
          await logout();
          return;
        }
      }

      // Check compliance status
      const complianceStatus = await AuthApi.checkComplianceStatus(user?.id);
      dispatch(authActions.updateComplianceStatus(complianceStatus));

      setSecurityContext(prev => ({
        ...prev,
        lastValidated: new Date(),
        complianceStatus: complianceStatus.status
      }));

    } catch (error: any) {
      setError(error.message);
    }
  }, [dispatch, user, logout]);

  // Set up security validation intervals
  useEffect(() => {
    if (isAuthenticated) {
      const securityInterval = setInterval(validateSecurityContext, SECURITY_VALIDATION_INTERVAL);
      const complianceInterval = setInterval(validateSecurityContext, COMPLIANCE_CHECK_INTERVAL);

      return () => {
        clearInterval(securityInterval);
        clearInterval(complianceInterval);
      };
    }
  }, [isAuthenticated, validateSecurityContext]);

  return {
    // Authentication state
    isAuthenticated,
    user,
    loading,
    error,
    mfaRequired,
    securityContext,
    complianceViolations,

    // Authentication methods
    login,
    logout,
    verifyMfa,
  };
};