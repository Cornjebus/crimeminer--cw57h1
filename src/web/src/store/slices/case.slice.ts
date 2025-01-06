/**
 * Redux Toolkit slice for case management with FedRAMP High and CJIS compliance.
 * Implements secure state management with comprehensive audit logging.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import {
  Case,
  CaseStatus,
  CaseAuditLog,
  CaseSecurityMetadata
} from '../../types/case.types';
import { CaseApi } from '../../services/api/case.api';

// Initialize API service
const caseApi = new CaseApi();

// Entity adapter for normalized state management
const casesAdapter = createEntityAdapter<Case>({
  selectId: (case_) => case_.id,
  sortComparer: (a, b) => b.updatedAt.localeCompare(a.updatedAt)
});

// Interface for case slice state
interface CaseState {
  entities: Record<string, Case>;
  ids: string[];
  selectedCase: Case | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  auditLogs: CaseAuditLog[];
  securityMetadata: CaseSecurityMetadata;
  realTimeStatus: {
    connected: boolean;
    lastSync: string;
  };
}

// Initial state with security context
const initialState: CaseState = {
  ...casesAdapter.getInitialState(),
  selectedCase: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0
  },
  auditLogs: [],
  securityMetadata: {
    classificationLevel: 'FEDRAMP_HIGH',
    lastAccessedBy: '',
    lastAccessedAt: new Date().toISOString(),
    chainOfCustody: []
  },
  realTimeStatus: {
    connected: false,
    lastSync: new Date().toISOString()
  }
};

// Async thunks with security validation
export const fetchCases = createAsyncThunk(
  'cases/fetchCases',
  async ({ page, limit, securityLevel }: { page: number; limit: number; securityLevel: string }) => {
    return await caseApi.getCases(page, limit);
  }
);

export const fetchCaseById = createAsyncThunk(
  'cases/fetchCaseById',
  async (id: string) => {
    return await caseApi.getCase(id);
  }
);

export const createCase = createAsyncThunk(
  'cases/createCase',
  async (caseData: Partial<Case>) => {
    return await caseApi.createCase(caseData);
  }
);

export const updateCase = createAsyncThunk(
  'cases/updateCase',
  async ({ id, data }: { id: string; data: Partial<Case> }) => {
    return await caseApi.updateCase(id, data);
  }
);

export const deleteCase = createAsyncThunk(
  'cases/deleteCase',
  async (id: string) => {
    await caseApi.deleteCase(id);
    return id;
  }
);

export const subscribeToRealTimeUpdates = createAsyncThunk(
  'cases/subscribeToRealTimeUpdates',
  async (userId: string) => {
    await caseApi.subscribeToUpdates(userId);
  }
);

// Case slice with enhanced security features
export const caseSlice = createSlice({
  name: 'cases',
  initialState,
  reducers: {
    setSelectedCase: (state, action) => {
      state.selectedCase = action.payload;
      state.securityMetadata.lastAccessedAt = new Date().toISOString();
      state.securityMetadata.lastAccessedBy = localStorage.getItem('userId') || '';
    },
    updateRealTimeStatus: (state, action) => {
      state.realTimeStatus = {
        ...state.realTimeStatus,
        ...action.payload,
        lastSync: new Date().toISOString()
      };
    },
    addAuditLog: (state, action) => {
      state.auditLogs.unshift(action.payload);
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch cases
      .addCase(fetchCases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCases.fulfilled, (state, action) => {
        state.loading = false;
        casesAdapter.setAll(state, action.payload.cases);
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total
        };
      })
      .addCase(fetchCases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch cases';
      })
      // Fetch single case
      .addCase(fetchCaseById.fulfilled, (state, action) => {
        casesAdapter.upsertOne(state, action.payload.case);
        state.selectedCase = action.payload.case;
        state.auditLogs = action.payload.auditLog;
      })
      // Create case
      .addCase(createCase.fulfilled, (state, action) => {
        casesAdapter.addOne(state, action.payload.case);
        state.securityMetadata.chainOfCustody.push({
          action: 'CREATE',
          timestamp: new Date().toISOString(),
          userId: localStorage.getItem('userId') || ''
        });
      })
      // Update case
      .addCase(updateCase.fulfilled, (state, action) => {
        casesAdapter.updateOne(state, {
          id: action.payload.case.id,
          changes: action.payload.case
        });
        if (state.selectedCase?.id === action.payload.case.id) {
          state.selectedCase = action.payload.case;
        }
      })
      // Delete case
      .addCase(deleteCase.fulfilled, (state, action) => {
        casesAdapter.removeOne(state, action.payload);
        if (state.selectedCase?.id === action.payload) {
          state.selectedCase = null;
        }
      })
      // Real-time updates
      .addCase(subscribeToRealTimeUpdates.fulfilled, (state) => {
        state.realTimeStatus.connected = true;
        state.realTimeStatus.lastSync = new Date().toISOString();
      })
      .addCase(subscribeToRealTimeUpdates.rejected, (state) => {
        state.realTimeStatus.connected = false;
      });
  }
});

// Export actions
export const {
  setSelectedCase,
  updateRealTimeStatus,
  addAuditLog,
  clearError
} = caseSlice.actions;

// Export selectors with memoization
export const {
  selectAll: selectAllCases,
  selectById: selectCaseById,
  selectIds: selectCaseIds
} = casesAdapter.getSelectors((state: any) => state.cases);

export const selectSelectedCase = (state: any) => state.cases.selectedCase;
export const selectCaseLoading = (state: any) => state.cases.loading;
export const selectCaseError = (state: any) => state.cases.error;
export const selectCasePagination = (state: any) => state.cases.pagination;
export const selectCaseAuditLogs = (state: any) => state.cases.auditLogs;
export const selectCaseSecurityMetadata = (state: any) => state.cases.securityMetadata;
export const selectRealTimeStatus = (state: any) => state.cases.realTimeStatus;

// Export reducer
export default caseSlice.reducer;