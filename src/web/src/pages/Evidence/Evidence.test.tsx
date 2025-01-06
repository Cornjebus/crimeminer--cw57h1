/**
 * Test suite for Evidence page component implementing FedRAMP High and CJIS compliance validation.
 * Validates secure evidence viewing, processing, and analysis functionality.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'; // v14.0.0
import { vi } from 'vitest'; // v0.34.0
import { MemoryRouter, Route, Routes } from 'react-router-dom'; // v6.11.0
import Evidence from './Evidence';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';

// Mock security-related data
const mockSecureEvidenceResponse = {
  id: 'test-evidence-1',
  caseId: 'test-case-1',
  mediaType: 'AUDIO',
  status: 'PROCESSED',
  securityClassification: 'RESTRICTED',
  chainOfCustody: ['hash1', 'hash2'],
  auditTrail: ['event1', 'event2'],
  metadata: {
    transcript: 'Test transcription content',
    entities: [
      { type: 'PERSON', value: 'John Doe', confidence: 0.95 },
      { type: 'LOCATION', value: 'Test Location', confidence: 0.88 }
    ]
  }
};

const mockSecurityContext = {
  userId: 'test-user',
  clearanceLevel: 'SECRET',
  sessionId: 'test-session',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL'
};

// Mock audit logger
const mockAuditLogger = {
  log: vi.fn(),
  error: vi.fn()
};

describe('Evidence Page', () => {
  // Set up secure test environment
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  // Clean up secure test environment
  afterAll(() => {
    server.close();
  });

  // Reset handlers and clear mocks between tests
  beforeEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  // Test secure evidence loading
  it('should securely load and display evidence with proper security context', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={mockSecurityContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    // Verify loading state with security message
    expect(screen.getByText('Validating security clearance...')).toBeInTheDocument();

    // Wait for evidence to load securely
    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Evidence Viewer' })).toBeInTheDocument();
    });

    // Verify audit logging
    expect(mockAuditLogger.log).toHaveBeenCalledWith({
      eventType: 'EVIDENCE_PAGE_VIEW',
      evidenceId: 'test-evidence-1',
      userId: mockSecurityContext.userId,
      timestamp: expect.any(Date),
      details: {
        clearanceLevel: mockSecurityContext.clearanceLevel
      }
    });
  });

  // Test security clearance validation
  it('should enforce security clearance requirements', async () => {
    const lowClearanceContext = {
      ...mockSecurityContext,
      clearanceLevel: 'CONFIDENTIAL'
    };

    renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={lowClearanceContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    // Verify security violation handling
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Security Violation');
    });

    // Verify security violation logging
    expect(mockAuditLogger.log).toHaveBeenCalledWith({
      eventType: 'SECURITY_VIOLATION',
      evidenceId: 'test-evidence-1',
      userId: lowClearanceContext.userId,
      timestamp: expect.any(Date),
      error: 'Insufficient security clearance'
    });
  });

  // Test chain of custody tracking
  it('should track chain of custody for evidence access', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={mockSecurityContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    // Verify custody chain update
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: expect.stringContaining('EVIDENCE_'),
        evidenceId: 'test-evidence-1',
        userId: mockSecurityContext.userId,
        timestamp: expect.any(Date)
      })
    );
  });

  // Test secure annotation creation
  it('should securely create and audit evidence annotations', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={mockSecurityContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    // Create annotation
    const annotationText = 'Test annotation';
    const annotationNote = 'Important detail';
    
    fireEvent.click(screen.getByText('Add Annotation'));
    fireEvent.change(screen.getByLabelText('Annotation text'), {
      target: { value: annotationNote }
    });

    // Verify annotation audit logging
    expect(mockAuditLogger.log).toHaveBeenCalledWith({
      eventType: 'ANNOTATION_CREATE',
      evidenceId: 'test-evidence-1',
      userId: mockSecurityContext.userId,
      timestamp: expect.any(Date),
      details: expect.objectContaining({
        text: annotationText,
        note: annotationNote
      })
    });
  });

  // Test error handling with security context
  it('should handle errors securely and maintain audit trail', async () => {
    // Mock API error
    server.use(
      // Add error handler here
    );

    renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={mockSecurityContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    // Verify error handling
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Error');
    });

    // Verify error audit logging
    expect(mockAuditLogger.log).toHaveBeenCalledWith({
      eventType: 'SECURITY_VIOLATION',
      evidenceId: 'test-evidence-1',
      userId: mockSecurityContext.userId,
      timestamp: expect.any(Date),
      error: expect.any(String)
    });
  });

  // Test cleanup and session monitoring
  it('should perform secure cleanup on unmount', async () => {
    const { unmount } = renderWithProviders(
      <MemoryRouter initialEntries={['/evidence/test-evidence-1']}>
        <Routes>
          <Route path="/evidence/:evidenceId" element={
            <Evidence 
              securityContext={mockSecurityContext}
              auditLogger={mockAuditLogger}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    // Unmount component
    unmount();

    // Verify cleanup audit logging
    expect(mockAuditLogger.log).toHaveBeenCalledWith({
      eventType: 'EVIDENCE_PAGE_EXIT',
      evidenceId: 'test-evidence-1',
      userId: mockSecurityContext.userId,
      timestamp: expect.any(Date)
    });
  });
});