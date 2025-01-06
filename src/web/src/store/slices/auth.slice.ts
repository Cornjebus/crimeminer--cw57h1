/**
 * Redux Toolkit slice for managing authentication state with FedRAMP High and CJIS compliance.
 * Implements secure state management, audit logging, and zero-trust architecture.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'; // v1.9.7
import {
  AuthState,
  LoginRequest,
  LoginResponse,
  User,
  SecurityClearance,
  ComplianceViolation,
  SecurityAuditLog
} from '../../types/auth.types';
import {
  login,
  logout,
  refreshToken,
  validateMfa,
  validateSecurityClearance
} from '../../services/api/auth.api';
import {
  setAuthTokens,
  clearAuthTokens,
  isTokenValid,
  encryptToken,
  logSecurityAudit
} from '../../utils/auth.util';

// Initial state with security tracking
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  mfaRequired: false,
  loading: false,
  error: null,
  securityClearance: null,
  sessionExpiry: null,
  lastActivity: null,
  complianceViolations: []
};

/**
 * Enhanced async thunk for secure login with FedRAMP and CJIS compliance
 */
export const loginAsync = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      // Generate security context
      const securityContext = {
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        ipAddress: window.location.hostname,
        userAgent: navigator.userAgent
      };

      // Attempt login with security context
      const response = await login(credentials);

      // Handle MFA requirement
      if (response.mfaRequired) {
        return {
          mfaRequired: true,
          sessionId: response.sessionId
        };
      }

      // Validate security clearance
      const clearanceValid = await validateSecurityClearance(response.user.securityClearance);
      if (!clearanceValid) {
        throw new Error('Invalid security clearance');
      }

      // Store encrypted tokens
      await setAuthTokens(response);

      // Log successful authentication
      await logSecurityAudit({
        eventType: 'AUTH_SUCCESS',
        userId: response.user.id,
        details: securityContext
      });

      return response;

    } catch (error: any) {
      // Log authentication failure
      await logSecurityAudit({
        eventType: 'AUTH_FAILURE',
        error: error.message,
        details: credentials.username
      });

      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced async thunk for secure logout with audit logging
 */
export const logoutAsync = createAsyncThunk(
  'auth/logout',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      
      // Log session termination
      await logSecurityAudit({
        eventType: 'LOGOUT',
        userId: state.auth.user?.id,
        details: {
          sessionDuration: state.auth.lastActivity 
            ? new Date().getTime() - state.auth.lastActivity.getTime()
            : 0
        }
      });

      // Perform server-side logout
      await logout();

      // Clear local auth state
      await clearAuthTokens();

    } catch (error: any) {
      // Always clear local state even if server logout fails
      await clearAuthTokens();
      
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced async thunk for MFA validation with CJIS compliance
 */
export const validateMfaAsync = createAsyncThunk(
  'auth/validateMfa',
  async ({ mfaCode, sessionToken }: { mfaCode: string, sessionToken: string }, { rejectWithValue }) => {
    try {
      // Generate security context
      const securityContext = {
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        mfaType: 'TOTP'
      };

      // Validate MFA code
      const response = await validateMfa(mfaCode, sessionToken, securityContext);

      // Validate security clearance
      const clearanceValid = await validateSecurityClearance(response.user.securityClearance);
      if (!clearanceValid) {
        throw new Error('Invalid security clearance');
      }

      // Store encrypted tokens
      await setAuthTokens(response);

      // Log successful MFA validation
      await logSecurityAudit({
        eventType: 'MFA_SUCCESS',
        userId: response.user.id,
        details: securityContext
      });

      return response;

    } catch (error: any) {
      // Log MFA failure
      await logSecurityAudit({
        eventType: 'MFA_FAILURE',
        error: error.message,
        details: { sessionToken }
      });

      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced auth slice with security features and compliance tracking
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Update last activity timestamp
    updateLastActivity: (state) => {
      state.lastActivity = new Date();
    },
    // Add compliance violation
    addComplianceViolation: (state, action) => {
      state.complianceViolations.push(action.payload);
    },
    // Clear compliance violations
    clearComplianceViolations: (state) => {
      state.complianceViolations = [];
    },
    // Update session expiry
    setSessionExpiry: (state, action) => {
      state.sessionExpiry = action.payload;
    },
    // Clear auth state
    clearAuth: (state) => {
      return { ...initialState };
    }
  },
  extraReducers: (builder) => {
    // Login cases
    builder.addCase(loginAsync.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(loginAsync.fulfilled, (state, action) => {
      if (action.payload.mfaRequired) {
        state.mfaRequired = true;
      } else {
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.securityClearance = action.payload.user.securityClearance;
        state.sessionExpiry = new Date(Date.now() + action.payload.expiresIn * 1000);
        state.lastActivity = new Date();
      }
      state.loading = false;
    });
    builder.addCase(loginAsync.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // MFA validation cases
    builder.addCase(validateMfaAsync.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(validateMfaAsync.fulfilled, (state, action) => {
      state.isAuthenticated = true;
      state.mfaRequired = false;
      state.user = action.payload.user;
      state.securityClearance = action.payload.user.securityClearance;
      state.sessionExpiry = new Date(Date.now() + action.payload.expiresIn * 1000);
      state.lastActivity = new Date();
      state.loading = false;
    });
    builder.addCase(validateMfaAsync.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Logout cases
    builder.addCase(logoutAsync.fulfilled, (state) => {
      return { ...initialState };
    });
    builder.addCase(logoutAsync.rejected, (state) => {
      return { ...initialState };
    });
  }
});

// Export actions and reducer
export const {
  updateLastActivity,
  addComplianceViolation,
  clearComplianceViolations,
  setSessionExpiry,
  clearAuth
} = authSlice.actions;

export default authSlice.reducer;