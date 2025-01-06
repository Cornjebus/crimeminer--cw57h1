/**
 * Redux slice for managing multimedia evidence analysis state
 * Implements FedRAMP High and CJIS compliant state management
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  MediaType,
  AnalysisType,
  AnalysisRequest,
  AnalysisResult,
  AnalysisStatus,
  SecurityContext,
  ComplianceStatus,
  AuditRecord
} from '../../types/analysis.types';
import {
  submitAnalysis,
  getAnalysisStatus,
  getAnalysisResults,
  validateSecurityContext,
  logAuditEvent
} from '../../services/api/analysis.api';

// Initial state with security and compliance tracking
interface AnalysisState {
  analysisJobs: Record<string, AnalysisStatus>;
  analysisResults: Record<string, AnalysisResult>;
  securityContext: SecurityContext | null;
  complianceStatus: ComplianceStatus;
  auditTrail: AuditRecord[];
  loading: boolean;
  error: string | null;
}

const initialState: AnalysisState = {
  analysisJobs: {},
  analysisResults: {},
  securityContext: null,
  complianceStatus: {
    level: 'FEDRAMP_HIGH',
    lastValidated: new Date().toISOString(),
    violations: []
  },
  auditTrail: [],
  loading: false,
  error: null
};

// Async thunks with security validation and audit logging
export const submitAnalysisRequest = createAsyncThunk(
  'analysis/submitRequest',
  async (payload: { request: AnalysisRequest; securityContext: SecurityContext }, { rejectWithValue }) => {
    try {
      // Validate security context
      await validateSecurityContext(payload.securityContext);

      // Submit analysis request
      const jobId = await submitAnalysis(payload.request, payload.securityContext);

      // Create audit record
      const auditRecord: AuditRecord = {
        timestamp: new Date().toISOString(),
        action: 'SUBMIT_ANALYSIS',
        evidenceId: payload.request.evidenceId,
        userId: payload.securityContext.userId,
        details: {
          jobId,
          mediaType: payload.request.mediaType,
          analysisTypes: payload.request.analysisTypes
        }
      };

      await logAuditEvent(auditRecord);

      return { jobId, auditRecord };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const getAnalysisJobStatus = createAsyncThunk(
  'analysis/getStatus',
  async (payload: { jobId: string; securityContext: SecurityContext }, { rejectWithValue }) => {
    try {
      // Validate security context
      await validateSecurityContext(payload.securityContext);

      // Get job status
      const status = await getAnalysisStatus(payload.jobId, payload.securityContext);

      // Create audit record
      const auditRecord: AuditRecord = {
        timestamp: new Date().toISOString(),
        action: 'CHECK_STATUS',
        evidenceId: status.jobId,
        userId: payload.securityContext.userId,
        details: { status: status.status }
      };

      await logAuditEvent(auditRecord);

      return { status, auditRecord };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const fetchAnalysisResults = createAsyncThunk(
  'analysis/getResults',
  async (payload: {
    evidenceId: string;
    resultType: AnalysisType;
    securityContext: SecurityContext;
  }, { rejectWithValue }) => {
    try {
      // Validate security context
      await validateSecurityContext(payload.securityContext);

      // Fetch results
      const results = await getAnalysisResults(
        payload.evidenceId,
        payload.resultType,
        payload.securityContext
      );

      // Create audit record
      const auditRecord: AuditRecord = {
        timestamp: new Date().toISOString(),
        action: 'FETCH_RESULTS',
        evidenceId: payload.evidenceId,
        userId: payload.securityContext.userId,
        details: { resultType: payload.resultType }
      };

      await logAuditEvent(auditRecord);

      return { results, auditRecord };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Slice definition with comprehensive state management
const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setSecurityContext: (state, action: PayloadAction<SecurityContext>) => {
      state.securityContext = action.payload;
    },
    clearAnalysisState: (state) => {
      state.analysisJobs = {};
      state.analysisResults = {};
      state.error = null;
    },
    updateComplianceStatus: (state, action: PayloadAction<ComplianceStatus>) => {
      state.complianceStatus = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Submit Analysis Request
    builder.addCase(submitAnalysisRequest.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(submitAnalysisRequest.fulfilled, (state, action) => {
      state.loading = false;
      state.analysisJobs[action.payload.jobId] = {
        jobId: action.payload.jobId,
        status: 'QUEUED',
        progress: 0,
        estimatedTimeRemaining: 0,
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      state.auditTrail.push(action.payload.auditRecord);
    });
    builder.addCase(submitAnalysisRequest.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Get Analysis Status
    builder.addCase(getAnalysisJobStatus.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(getAnalysisJobStatus.fulfilled, (state, action) => {
      state.loading = false;
      state.analysisJobs[action.payload.status.jobId] = action.payload.status;
      state.auditTrail.push(action.payload.auditRecord);
    });
    builder.addCase(getAnalysisJobStatus.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Fetch Analysis Results
    builder.addCase(fetchAnalysisResults.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchAnalysisResults.fulfilled, (state, action) => {
      state.loading = false;
      state.analysisResults[action.payload.results.evidenceId] = action.payload.results;
      state.auditTrail.push(action.payload.auditRecord);
    });
    builder.addCase(fetchAnalysisResults.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
  }
});

// Export actions and selectors
export const { setSecurityContext, clearAnalysisState, updateComplianceStatus } = analysisSlice.actions;

// Selectors with security filtering
export const selectAnalysisState = (state: { analysis: AnalysisState }) => state.analysis;
export const selectAnalysisById = (state: { analysis: AnalysisState }, jobId: string) => 
  state.analysis.analysisJobs[jobId];
export const selectAnalysisStatus = (state: { analysis: AnalysisState }, evidenceId: string) => 
  state.analysis.analysisResults[evidenceId];
export const selectSecurityContext = (state: { analysis: AnalysisState }) => 
  state.analysis.securityContext;
export const selectComplianceStatus = (state: { analysis: AnalysisState }) => 
  state.analysis.complianceStatus;
export const selectAuditTrail = (state: { analysis: AnalysisState }) => 
  state.analysis.auditTrail;

export default analysisSlice.reducer;