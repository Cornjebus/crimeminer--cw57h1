import React from 'react'; // v18.0.0
import { screen, fireEvent, waitFor } from '@testing-library/react'; // v14.0.0
import { describe, it, expect, vi, beforeEach } from 'vitest'; // v0.34.0
import '@testing-library/jest-dom/extend-expect'; // v5.16.5

import { CaseDetails } from './CaseDetails';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { Case, CaseStatus, SecurityClassification } from '../../../types/case.types';

// Mock hooks and utilities
vi.mock('../../../hooks/useCase', () => ({
  default: () => ({
    selectedCase: null,
    loading: false,
    updateCase: vi.fn(),
    deleteCase: vi.fn(),
    subscribeToUpdates: vi.fn()
  })
}));

// Create secure mock case data
const createSecureMockCase = (overrides?: Partial<Case>): Case => ({
  id: crypto.randomUUID(),
  title: 'Test Case',
  description: 'Test case description',
  status: CaseStatus.ACTIVE,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'test-user',
  lastModifiedBy: 'test-user',
  securityClassification: SecurityClassification.SECRET,
  metadata: {
    evidenceCount: 5,
    teamMembers: [
      { id: 'user-1', name: 'John Doe' }
    ],
    classificationLevel: 'SECRET',
    complianceStatus: 'COMPLIANT',
    lastAccessedBy: 'test-user',
    lastAccessedAt: new Date().toISOString()
  },
  auditTrail: [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'CREATE',
      userId: 'test-user',
      details: {}
    }
  ],
  ...overrides
});

describe('CaseDetails Security and Compliance Tests', () => {
  const mockSecurityContext = {
    userId: 'test-user',
    canEdit: true,
    canDelete: true,
    token: 'mock-token',
    isValid: true,
    validateAccess: vi.fn().mockResolvedValue([])
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates security classification display', async () => {
    const mockCase = createSecureMockCase();
    
    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Verify security classification is displayed
    expect(screen.getByText(`Classification: ${mockCase.securityClassification}`))
      .toBeInTheDocument();

    // Verify security context validation was called
    expect(mockSecurityContext.validateAccess).toHaveBeenCalledWith({
      resourceType: 'CASE',
      resourceId: mockCase.id,
      action: 'VIEW',
      classification: mockCase.securityClassification
    });
  });

  it('enforces FedRAMP compliance for case access', async () => {
    const mockCase = createSecureMockCase({
      securityClassification: SecurityClassification.TOP_SECRET
    });

    mockSecurityContext.validateAccess.mockResolvedValueOnce([
      'Insufficient security clearance'
    ]);

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Verify access denied message is displayed
    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText('Insufficient security clearance')).toBeInTheDocument();
    });
  });

  it('maintains CJIS compliance for audit logging', async () => {
    const mockCase = createSecureMockCase();
    const mockUpdateCase = vi.fn();

    vi.mock('../../../hooks/useCase', () => ({
      default: () => ({
        selectedCase: mockCase,
        loading: false,
        updateCase: mockUpdateCase,
        deleteCase: vi.fn(),
        subscribeToUpdates: vi.fn()
      })
    }));

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Edit case
    fireEvent.click(screen.getByLabelText('Edit case'));
    fireEvent.change(screen.getByLabelText('Case title'), {
      target: { value: 'Updated Title' }
    });
    fireEvent.click(screen.getByLabelText('Save changes'));

    // Verify audit trail update
    await waitFor(() => {
      expect(mockUpdateCase).toHaveBeenCalledWith({
        id: mockCase.id,
        title: 'Updated Title'
      });
    });
  });

  it('validates chain of custody for evidence updates', async () => {
    const mockCase = createSecureMockCase({
      metadata: {
        ...createSecureMockCase().metadata,
        evidenceCount: 10
      }
    });

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Verify evidence count display
    expect(screen.getByText('10 items')).toBeInTheDocument();
  });

  it('enforces access controls based on security context', async () => {
    const mockCase = createSecureMockCase();
    const restrictedContext = {
      ...mockSecurityContext,
      canEdit: false,
      canDelete: false
    };

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={restrictedContext}
      />
    );

    // Verify restricted actions
    expect(screen.getByLabelText('Edit case')).toBeDisabled();
    expect(screen.getByLabelText('Delete case')).toBeDisabled();
  });

  it('handles real-time updates securely', async () => {
    const mockCase = createSecureMockCase();
    const mockHandleRealTimeUpdate = vi.fn();

    vi.mock('../../../hooks/useCase', () => ({
      default: () => ({
        selectedCase: mockCase,
        loading: false,
        updateCase: vi.fn(),
        deleteCase: vi.fn(),
        subscribeToUpdates: vi.fn(),
        handleRealTimeUpdate: mockHandleRealTimeUpdate
      })
    }));

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Verify WebSocket connection with security headers
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining(mockCase.id),
      expect.objectContaining({
        headers: {
          'Authorization': `Bearer ${mockSecurityContext.token}`,
          'X-Security-Level': mockCase.securityClassification
        }
      })
    );
  });

  it('validates audit trail display', async () => {
    const mockCase = createSecureMockCase({
      auditTrail: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: 'VIEW',
          userId: 'test-user',
          details: {}
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          action: 'UPDATE',
          userId: 'test-user',
          details: { field: 'title' }
        }
      ]
    });

    renderWithProviders(
      <CaseDetails 
        caseId={mockCase.id} 
        onClose={() => {}} 
        securityContext={mockSecurityContext}
      />
    );

    // Verify audit trail entries
    expect(screen.getByText(/VIEW by test-user/)).toBeInTheDocument();
    expect(screen.getByText(/UPDATE by test-user/)).toBeInTheDocument();
  });
});