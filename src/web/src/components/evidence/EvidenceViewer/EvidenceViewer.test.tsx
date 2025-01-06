import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { vi } from 'vitest'; // v0.34.0
import { SecurityContext } from '@company/security-context'; // v1.0.0
import { AuditLogger } from '@company/audit-logger'; // v1.0.0

import { EvidenceViewer } from './EvidenceViewer';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { EvidenceMediaType, SecurityClassification } from '../../../types/evidence.types';

// Mock security context
const mockSecurityContext: SecurityContext = {
  userId: 'test-user-id',
  sessionId: 'test-session-id',
  clearanceLevel: SecurityClassification.SECRET,
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL'
};

// Mock audit logger
const mockAuditLogger = {
  logEvidenceAccess: vi.fn(),
  logSecurityEvent: vi.fn(),
  logComplianceCheck: vi.fn()
};

// Mock evidence data
const mockEvidence = {
  id: 'test-evidence-id',
  mediaType: EvidenceMediaType.VIDEO,
  url: 'https://evidence.crimeminer.gov/test-video.mp4',
  metadata: {
    transcript: 'Test transcript content',
    entities: [
      { type: 'PERSON', value: 'John Doe', confidence: 0.95 },
      { type: 'LOCATION', value: 'Test Location', confidence: 0.85 }
    ]
  },
  security: {
    classificationLevel: SecurityClassification.SECRET,
    chainOfCustody: []
  },
  status: 'COMPLETED'
};

describe('EvidenceViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AuditLogger.log = mockAuditLogger.logEvidenceAccess;
  });

  it('should enforce security controls and validate clearance levels', async () => {
    const onSecurityViolation = vi.fn();

    renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.CONFIDENTIAL}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={[]}
        onSecurityViolation={onSecurityViolation}
      />
    );

    // Verify security error is displayed
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Security Error');
    });

    // Verify security violation callback
    expect(onSecurityViolation).toHaveBeenCalledWith({
      code: 'SECURITY_VIOLATION',
      message: 'Insufficient security clearance',
      timestamp: expect.any(Date),
      evidenceId: mockEvidence.id,
      userId: 'test-user'
    });

    // Verify audit logging
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith({
      eventType: 'SECURITY_VIOLATION',
      evidenceId: mockEvidence.id,
      userId: 'test-user',
      sessionId: 'test-session',
      details: expect.any(Object)
    });
  });

  it('should handle secure media playback with audit logging', async () => {
    const onAnnotationCreate = vi.fn();

    renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.SECRET}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={[]}
        onAnnotationCreate={onAnnotationCreate}
      />
    );

    // Wait for media player to load
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Evidence Viewer' })).toBeInTheDocument();
    });

    // Verify media player controls
    const mediaPlayer = screen.getByRole('region', { name: 'Evidence Viewer' });
    expect(mediaPlayer).toHaveAttribute('aria-label', 'Evidence Viewer');

    // Verify audit logging for media access
    expect(mockAuditLogger.logEvidenceAccess).toHaveBeenCalledWith({
      eventType: 'EVIDENCE_VIEW_START',
      evidenceId: mockEvidence.id,
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: expect.any(Date)
    });
  });

  it('should support secure annotation creation with compliance validation', async () => {
    const onAnnotationCreate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.SECRET}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={[]}
        onAnnotationCreate={onAnnotationCreate}
      />
    );

    // Select text for annotation
    const transcriptText = screen.getByRole('document', { name: 'Evidence Transcript' });
    await user.pointer({ target: transcriptText, keys: '[MouseLeft]' });
    window.getSelection()?.setBaseAndExtent(transcriptText, 0, transcriptText, 1);

    // Add annotation
    const annotationInput = await screen.findByRole('textbox', { name: 'Annotation text' });
    await user.type(annotationInput, 'Test annotation');

    // Verify annotation creation
    expect(onAnnotationCreate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      'Test annotation',
      expect.objectContaining({
        userId: 'test-user',
        sessionId: 'test-session',
        clearanceLevel: SecurityClassification.SECRET
      })
    );

    // Verify audit logging
    expect(mockAuditLogger.logEvidenceAccess).toHaveBeenCalledWith({
      eventType: 'ANNOTATION_CREATE',
      evidenceId: mockEvidence.id,
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: expect.any(Date),
      details: expect.any(Object)
    });
  });

  it('should maintain chain of custody with comprehensive audit trail', async () => {
    const mockCustodyChain = [
      {
        timestamp: new Date(),
        action: 'VIEW',
        userId: 'test-user',
        details: { ipAddress: '127.0.0.1' }
      }
    ];

    renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.SECRET}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={mockCustodyChain}
      />
    );

    // Verify chain of custody display
    const custodySection = screen.getByRole('region', { name: 'Chain of Custody' });
    expect(custodySection).toBeInTheDocument();
    expect(custodySection).toHaveTextContent('test-user');
    expect(custodySection).toHaveTextContent('VIEW');

    // Verify audit logging includes custody updates
    expect(mockAuditLogger.logEvidenceAccess).toHaveBeenCalledWith({
      eventType: 'EVIDENCE_VIEW_START',
      evidenceId: mockEvidence.id,
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: expect.any(Date),
      details: expect.objectContaining({
        chainOfCustody: expect.any(Array)
      })
    });
  });

  it('should enforce accessibility requirements and WCAG compliance', async () => {
    renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.SECRET}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={[]}
      />
    );

    // Verify ARIA labels and roles
    expect(screen.getByRole('region', { name: 'Evidence Viewer' })).toBeInTheDocument();
    expect(screen.getByRole('document', { name: 'Evidence Transcript' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Detected Entities' })).toBeInTheDocument();

    // Verify keyboard navigation
    const viewer = screen.getByRole('region', { name: 'Evidence Viewer' });
    fireEvent.keyDown(viewer, { key: 'Tab' });
    expect(document.activeElement).toHaveAttribute('role');

    // Verify color contrast and text alternatives
    const entities = screen.getAllByRole('listitem');
    entities.forEach(entity => {
      expect(entity).toHaveTextContent(/\d+%/); // Confidence score
      expect(entity).toHaveStyle({ color: expect.any(String) });
    });
  });

  it('should handle cleanup and session termination securely', async () => {
    const { unmount } = renderWithProviders(
      <EvidenceViewer
        evidence={mockEvidence}
        securityLevel={SecurityClassification.SECRET}
        auditContext={{
          userId: 'test-user',
          sessionId: 'test-session',
          ipAddress: '127.0.0.1'
        }}
        custodyChain={[]}
      />
    );

    // Trigger component unmount
    unmount();

    // Verify cleanup audit logging
    expect(mockAuditLogger.logEvidenceAccess).toHaveBeenCalledWith({
      eventType: 'EVIDENCE_VIEW_END',
      evidenceId: mockEvidence.id,
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: expect.any(Date)
    });
  });
});