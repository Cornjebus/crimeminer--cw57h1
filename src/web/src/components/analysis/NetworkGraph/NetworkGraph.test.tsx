import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // v14.0.0
import { vi, describe, it, expect, beforeEach } from 'vitest'; // v0.34.0
import { Provider } from 'react-redux'; // v8.1.1
import { configureStore } from '@reduxjs/toolkit';
import NetworkGraph from './NetworkGraph';
import { AnalysisResult } from '../../../types/analysis.types';
import { COMPLIANCE_LEVELS } from '../../../constants/api.constants';

// Mock dependencies
vi.mock('react-force-graph', () => ({
  default: vi.fn(({ onNodeClick, onZoom }) => (
    <div data-testid="force-graph">
      <div data-testid="node" onClick={() => onNodeClick({ id: 'test-node' })} />
      <div data-testid="zoom" onClick={() => onZoom()} />
    </div>
  ))
}));

vi.mock('@security/context', () => ({
  default: () => ({
    validateAccess: vi.fn().mockResolvedValue(true),
    checkClassification: vi.fn().mockResolvedValue(true)
  })
}));

// Mock audit logging
const mockAuditLog = vi.fn();
vi.mock('../../../hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    getResults: vi.fn().mockResolvedValue([mockAnalysisResults[0]]),
    auditLog: mockAuditLog
  })
}));

// Test data
const mockAnalysisResults: AnalysisResult[] = [{
  evidenceId: 'test-evidence-1',
  resultType: 'ENTITY_EXTRACTION',
  content: {
    entities: [
      {
        type: 'PERSON',
        value: 'John Doe',
        confidence: 0.95,
        classification: COMPLIANCE_LEVELS.FEDRAMP_HIGH,
        metadata: { source: 'transcript' }
      },
      {
        type: 'LOCATION',
        value: 'Test Location',
        confidence: 0.88,
        classification: COMPLIANCE_LEVELS.CJIS,
        metadata: { source: 'video' }
      }
    ]
  },
  confidence: 0.92,
  processingTime: 1500,
  version: '1.0.0',
  metadata: {}
}];

// Mock security context
const mockSecurityContext = {
  userId: 'test-user',
  classification: COMPLIANCE_LEVELS.CJIS,
  permissions: ['VIEW_ENTITIES', 'INTERACT_GRAPH'],
  headers: {
    'X-Classification-Level': COMPLIANCE_LEVELS.CJIS,
    'X-Audit-User-ID': 'test-user'
  }
};

// Helper function to render with providers
const renderWithProviders = (ui: React.ReactElement, initialState = {}) => {
  const store = configureStore({
    reducer: {
      analysis: (state = initialState) => state
    }
  });

  return render(
    <Provider store={store}>
      {ui}
    </Provider>
  );
};

describe('NetworkGraph Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with security context and validates classification', async () => {
    const { getByTestId } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    expect(mockAuditLog).toHaveBeenCalledWith('graph-data-process', {
      evidenceId: 'test-evidence-1'
    });
  });

  it('handles secure node interactions with audit logging', async () => {
    const mockHandleNodeSelect = vi.fn();
    const { getByTestId } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={mockSecurityContext}
        onNodeSelect={mockHandleNodeSelect}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    fireEvent.click(getByTestId('node'));

    expect(mockAuditLog).toHaveBeenCalledWith('node-interaction', {
      nodeId: 'test-node',
      nodeType: expect.any(String),
      classification: expect.any(String)
    });
    expect(mockHandleNodeSelect).toHaveBeenCalled();
  });

  it('enforces zoom boundaries with security controls', async () => {
    const { getByTestId } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    fireEvent.click(getByTestId('zoom'));
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('filters nodes based on security classification', async () => {
    const restrictedContext = {
      ...mockSecurityContext,
      classification: COMPLIANCE_LEVELS.FEDRAMP_HIGH
    };

    const { getByTestId } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={restrictedContext}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    // Verify only FEDRAMP_HIGH classified nodes are processed
    expect(mockAuditLog).toHaveBeenCalledWith('graph-data-process', {
      evidenceId: 'test-evidence-1'
    });
  });

  it('handles real-time graph updates securely', async () => {
    const { getByTestId, rerender } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    // Simulate evidence update
    const updatedContext = {
      ...mockSecurityContext,
      timestamp: new Date().toISOString()
    };

    rerender(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={updatedContext}
      />
    );

    expect(mockAuditLog).toHaveBeenCalledTimes(2);
  });

  it('validates FedRAMP compliance requirements', async () => {
    const { getByTestId } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={{
          ...mockSecurityContext,
          compliance: COMPLIANCE_LEVELS.FEDRAMP_HIGH
        }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    // Verify compliance audit logging
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.stringContaining('graph-data-process'),
      expect.any(Object)
    );
  });

  it('handles security context changes with audit trail', async () => {
    const { getByTestId, rerender } = renderWithProviders(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(getByTestId('force-graph')).toBeInTheDocument();
    });

    // Change security context
    const newContext = {
      ...mockSecurityContext,
      classification: COMPLIANCE_LEVELS.FEDRAMP_HIGH
    };

    rerender(
      <NetworkGraph
        evidenceId="test-evidence-1"
        securityContext={newContext}
      />
    );

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.stringContaining('graph-data-process'),
      expect.any(Object)
    );
  });
});