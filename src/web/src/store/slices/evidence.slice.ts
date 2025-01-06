/**
 * Redux slice for managing evidence state with FedRAMP High and CJIS compliance features.
 * Implements comprehensive security classifications, audit logging, and chain of custody tracking.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit'; // v1.9.5
import {
  Evidence,
  SecurityClassification,
  AuditLogEntry,
  ChainOfCustody
} from '../../types/evidence.types';
import {
  updateSecurityClassification,
  logAuditEntry,
  updateChainOfCustody
} from '../../services/api/evidence.api';

// Entity adapter for normalized state management
const evidenceAdapter = createEntityAdapter<Evidence>({
  selectId: (evidence) => evidence.id,
  sortComparer: (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
});

// Enhanced initial state with security and compliance features
interface EvidenceState {
  items: Evidence[];
  selectedEvidence: Evidence | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  securityClassifications: Record<string, SecurityClassification>;
  auditLog: AuditLogEntry[];
  chainOfCustody: Record<string, ChainOfCustody[]>;
  complianceStatus: Record<string, boolean>;
  retentionPolicy: Record<string, Date>;
}

const initialState: EvidenceState = {
  items: [],
  selectedEvidence: null,
  status: 'idle',
  error: null,
  securityClassifications: {},
  auditLog: [],
  chainOfCustody: {},
  complianceStatus: {},
  retentionPolicy: {}
};

// Async thunks with enhanced security features
export const updateEvidenceClassification = createAsyncThunk(
  'evidence/updateClassification',
  async ({ evidenceId, classification }: { evidenceId: string; classification: SecurityClassification }) => {
    const response = await updateSecurityClassification(evidenceId, classification);
    return response.data;
  }
);

export const addAuditLogEntry = createAsyncThunk(
  'evidence/addAuditEntry',
  async (entry: AuditLogEntry) => {
    await logAuditEntry(entry);
    return entry;
  }
);

export const updateEvidenceChainOfCustody = createAsyncThunk(
  'evidence/updateChainOfCustody',
  async ({ evidenceId, custodyEntry }: { evidenceId: string; custodyEntry: ChainOfCustody }) => {
    const response = await updateChainOfCustody(evidenceId, custodyEntry);
    return { evidenceId, custodyEntry: response.data };
  }
);

// Enhanced evidence slice with security and compliance features
const evidenceSlice = createSlice({
  name: 'evidence',
  initialState,
  reducers: {
    setSelectedEvidence: (state, action) => {
      state.selectedEvidence = action.payload;
    },
    clearSelectedEvidence: (state) => {
      state.selectedEvidence = null;
    },
    updateComplianceStatus: (state, action) => {
      const { evidenceId, status } = action.payload;
      state.complianceStatus[evidenceId] = status;
    },
    updateRetentionPolicy: (state, action) => {
      const { evidenceId, date } = action.payload;
      state.retentionPolicy[evidenceId] = new Date(date);
    }
  },
  extraReducers: (builder) => {
    builder
      // Update classification handlers
      .addCase(updateEvidenceClassification.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(updateEvidenceClassification.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.securityClassifications[action.payload.id] = action.payload.classificationLevel;
        const evidenceIndex = state.items.findIndex(item => item.id === action.payload.id);
        if (evidenceIndex !== -1) {
          state.items[evidenceIndex] = {
            ...state.items[evidenceIndex],
            classificationLevel: action.payload.classificationLevel
          };
        }
      })
      .addCase(updateEvidenceClassification.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Classification update failed';
      })
      // Audit log handlers
      .addCase(addAuditLogEntry.fulfilled, (state, action) => {
        state.auditLog.push(action.payload);
      })
      // Chain of custody handlers
      .addCase(updateEvidenceChainOfCustody.fulfilled, (state, action) => {
        const { evidenceId, custodyEntry } = action.payload;
        if (!state.chainOfCustody[evidenceId]) {
          state.chainOfCustody[evidenceId] = [];
        }
        state.chainOfCustody[evidenceId].push(custodyEntry);
      });
  }
});

// Export actions and selectors
export const {
  setSelectedEvidence,
  clearSelectedEvidence,
  updateComplianceStatus,
  updateRetentionPolicy
} = evidenceSlice.actions;

// Enhanced selectors with security filtering
export const selectAllEvidence = (state: { evidence: EvidenceState }) =>
  state.evidence.items.filter(item => 
    state.evidence.complianceStatus[item.id] !== false
  );

export const selectEvidenceById = (state: { evidence: EvidenceState }, evidenceId: string) =>
  state.evidence.items.find(item => item.id === evidenceId);

export const selectEvidenceClassification = (state: { evidence: EvidenceState }, evidenceId: string) =>
  state.evidence.securityClassifications[evidenceId];

export const selectEvidenceAuditLog = (state: { evidence: EvidenceState }) =>
  state.evidence.auditLog;

export const selectEvidenceChainOfCustody = (state: { evidence: EvidenceState }, evidenceId: string) =>
  state.evidence.chainOfCustody[evidenceId] || [];

export const selectEvidenceRetentionDate = (state: { evidence: EvidenceState }, evidenceId: string) =>
  state.evidence.retentionPolicy[evidenceId];

// Export reducer
export default evidenceSlice.reducer;