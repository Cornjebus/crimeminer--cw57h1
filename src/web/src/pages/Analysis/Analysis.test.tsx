/**
 * Test suite for Analysis page component implementing FedRAMP High and CJIS compliance validation
 * with comprehensive security testing and audit logging verification.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Analysis from './Analysis';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';

// Security context for testing
const mockSecurityContext = {
  userId: 'test-investigator-1',
  clearanceLevel: 'SECRET',
  sessionId: 'test-session-1',
  auditToken: 'test-audit-token',
  permissions: ['ANALYSIS_READ', 'ANALYSIS_WRITE']
};

// Mock analysis results with security classification
const mockAnalysisResults = {
  evidenceId: 'test-evidence-1',
  securityContext: {
    classification: 'SECRET',
    handling: 'NOFORN'
  },
  content: {
    timeline: [
      {
        id: 'event-1',
        type: 'TRANSCRIPTION',
        timestamp: '2024-01-15T10:00:00Z',
        classification: 'SECRET'
      }
    ],
    entities: [
      {
        id: 'entity-1',
        type: 'PERSON',
        value: 'John Doe',
        confidence: 0.95,
        classification: 'SECRET'
      }
    ],
    relationships: [
      {
        source: 'entity-1',
        target: 'entity-2',
        type: 'ASSOCIATED_WITH',
        confidence: 0.85,
        classification: 'SECRET'
      }
    ]
  },
  audit: {
    accessLog: [],
    chainOfCustody: []
  }
};

// Helper function to render Analysis page with security context
const renderSecureAnalysisPage = (options = {}) => {
  const {
    evidenceId = 'test-evidence-1',
    initialState = {},
    securityContext = mockSecurityContext
  } = options;

  return renderWithProviders(
    <MemoryRouter initialEntries={[`/analysis/${evidenceId}`]}>
      <Routes>
        <Route 
          path="/analysis/:evidenceId" 
          element={<Analysis securityContext={securityContext} />} 
        />
      </Routes>
    </MemoryRouter>,
    {
      preloadedState: initialState
    }
  );
};

describe('Analysis Page Security and Functionality', () => {
  beforeEach(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('validates security context and headers', async () => {
    const { container } = renderSecureAnalysisPage();

    // Verify security headers are present
    expect(container.querySelector('[data-security-level]'))
      .toHaveAttribute('data-security-level', 'SECRET');

    // Verify CJIS compliance markers
    expect(container.querySelector('[data-compliance="CJIS"]'))
      .toBeInTheDocument();

    // Verify FedRAMP classification
    expect(container.querySelector('[data-classification="FEDRAMP_HIGH"]'))
      .toBeInTheDocument();
  });

  it('enforces access control based on security clearance', async () => {
    const lowClearanceContext = {
      ...mockSecurityContext,
      clearanceLevel: 'CONFIDENTIAL'
    };

    renderSecureAnalysisPage({ securityContext: lowClearanceContext });

    // Verify restricted access to classified content
    await waitFor(() => {
      expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
    });

    // Verify access denied message
    expect(screen.getByText(/insufficient clearance level/i))
      .toBeInTheDocument();
  });

  it('maintains audit trail for analysis interactions', async () => {
    const { store } = renderSecureAnalysisPage();

    // Interact with timeline
    const timelineEvent = await screen.findByTestId('timeline-event-1');
    fireEvent.click(timelineEvent);

    // Verify audit log entry
    const state = store.getState();
    const auditLogs = state.analysis.auditTrail;
    
    expect(auditLogs[auditLogs.length - 1]).toMatchObject({
      action: 'TIMELINE_EVENT_CLICK',
      userId: mockSecurityContext.userId,
      entityId: 'event-1'
    });
  });

  it('implements secure real-time updates', async () => {
    const { store } = renderSecureAnalysisPage();

    // Simulate real-time update
    store.dispatch({
      type: 'analysis/updateRealTime',
      payload: {
        evidenceId: 'test-evidence-1',
        update: {
          type: 'NEW_ENTITY',
          data: {
            id: 'entity-3',
            type: 'LOCATION',
            value: 'Test Location',
            classification: 'SECRET'
          }
        }
      }
    });

    // Verify update is reflected with security context
    await waitFor(() => {
      const state = store.getState();
      expect(state.analysis.entities).toContainEqual(
        expect.objectContaining({
          id: 'entity-3',
          classification: 'SECRET'
        })
      );
    });
  });

  it('validates chain of custody for evidence analysis', async () => {
    renderSecureAnalysisPage();

    // Verify chain of custody component
    const custodyChain = await screen.findByTestId('chain-of-custody');
    
    expect(within(custodyChain).getByText(/Analysis Initiated/i))
      .toBeInTheDocument();
    
    // Verify custody transfer logging
    const transferLog = within(custodyChain).getByTestId('custody-log');
    expect(transferLog).toHaveAttribute('data-user', mockSecurityContext.userId);
  });

  it('implements secure entity selection with classification validation', async () => {
    renderSecureAnalysisPage();

    // Select entity
    const entityList = await screen.findByTestId('entity-list');
    const entity = within(entityList).getByText('John Doe');
    
    fireEvent.click(entity);

    // Verify security validation
    await waitFor(() => {
      expect(screen.getByTestId('selected-entity'))
        .toHaveAttribute('data-classification', 'SECRET');
    });
  });

  it('handles security violations appropriately', async () => {
    const { store } = renderSecureAnalysisPage();

    // Simulate security violation
    store.dispatch({
      type: 'security/violation',
      payload: {
        type: 'UNAUTHORIZED_ACCESS',
        details: 'Attempted access to classified data'
      }
    });

    // Verify violation handling
    expect(screen.getByRole('alert'))
      .toHaveTextContent(/security violation detected/i);

    // Verify audit logging of violation
    const state = store.getState();
    expect(state.security.violations).toContainEqual(
      expect.objectContaining({
        type: 'UNAUTHORIZED_ACCESS'
      })
    );
  });

  it('implements secure data refresh mechanism', async () => {
    const { store } = renderSecureAnalysisPage();

    // Trigger refresh
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    // Verify secure refresh
    await waitFor(() => {
      const state = store.getState();
      expect(state.analysis.lastRefresh).toBeDefined();
      expect(state.analysis.refreshToken).toBeDefined();
    });
  });

  it('validates FedRAMP compliance requirements', async () => {
    renderSecureAnalysisPage();

    // Verify required FedRAMP elements
    expect(screen.getByTestId('fedramp-banner')).toBeInTheDocument();
    expect(screen.getByTestId('classification-header'))
      .toHaveAttribute('data-level', 'FEDRAMP_HIGH');
    
    // Verify audit requirements
    const auditSection = screen.getByTestId('audit-section');
    expect(within(auditSection).getByText(/last accessed/i)).toBeInTheDocument();
  });
});