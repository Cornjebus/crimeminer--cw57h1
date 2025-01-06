/**
 * Test suite for Timeline component implementing FedRAMP High and CJIS compliance validation
 * @version 1.0.0
 */

import { vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import Timeline from './Timeline';

// Mock security context
const mockSecurityContext = {
  userId: 'test-user-123',
  classificationLevel: 'FEDRAMP_HIGH',
  agencyId: 'TEST-AGENCY',
  jurisdiction: 'FEDERAL',
  sessionId: crypto.randomUUID(),
  clearanceLevel: 'SECRET',
  auditEnabled: true
};

// Mock evidence analysis results
const mockAnalysisResults = [
  {
    id: 'result-1',
    evidenceId: 'evidence-123',
    resultType: 'TRANSCRIPTION',
    content: { text: 'Test transcription' },
    confidence: 0.95,
    processingTime: new Date('2024-01-15T10:00:00Z').getTime(),
    securityClassification: 'SECRET',
    complianceStatus: 'COMPLIANT'
  },
  {
    id: 'result-2',
    evidenceId: 'evidence-123',
    resultType: 'ENTITY_EXTRACTION',
    content: { entities: ['Person A', 'Location B'] },
    confidence: 0.88,
    processingTime: new Date('2024-01-15T10:05:00Z').getTime(),
    securityClassification: 'CONFIDENTIAL',
    complianceStatus: 'COMPLIANT'
  }
];

// Mock audit logging function
const mockAuditLogger = vi.fn();

// Mock security validation function
const mockValidateAccess = vi.fn();

describe('Timeline Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Setup security context mocks
    mockValidateAccess.mockResolvedValue(true);
    
    // Setup audit logging mock
    mockAuditLogger.mockResolvedValue(undefined);
  });

  it('should render timeline with proper security context', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />,
      {
        preloadedState: {
          analysis: {
            results: mockAnalysisResults,
            securityContext: mockSecurityContext
          }
        }
      }
    );

    await waitFor(() => {
      expect(container.querySelector('.timeline-container')).toBeInTheDocument();
      expect(mockValidateAccess).toHaveBeenCalledWith(
        mockSecurityContext,
        'VIEW_TIMELINE'
      );
    });
  });

  it('should handle classified events with proper security controls', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      const timelineEvents = container.querySelectorAll('.timeline-event');
      expect(timelineEvents[0]).toHaveClass('security-level-SECRET');
      expect(timelineEvents[1]).toHaveClass('security-level-CONFIDENTIAL');
    });
  });

  it('should enforce access controls based on security clearance', async () => {
    const restrictedContext = {
      ...mockSecurityContext,
      clearanceLevel: 'CONFIDENTIAL'
    };

    renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={restrictedContext}
      />
    );

    await waitFor(() => {
      // Should not show SECRET level events
      const secretEvents = screen.queryAllByText(/SECRET/);
      expect(secretEvents).toHaveLength(0);
    });
  });

  it('should generate audit logs for timeline interactions', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />
    );

    // Click on timeline event
    const timelineEvent = await waitFor(() => 
      container.querySelector('.timeline-event')
    );
    
    fireEvent.click(timelineEvent as Element);

    expect(mockAuditLogger).toHaveBeenCalledWith({
      action: 'EVENT_CLICKED',
      evidenceId: 'evidence-123',
      eventId: 'result-1',
      userId: mockSecurityContext.userId
    });
  });

  it('should maintain chain of custody for evidence timeline', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(mockValidateAccess).toHaveBeenCalledWith(
        mockSecurityContext,
        'INIT_TIMELINE'
      );
      expect(mockAuditLogger).toHaveBeenCalledWith({
        action: 'TIMELINE_INITIALIZED',
        evidenceId: 'evidence-123',
        userId: mockSecurityContext.userId
      });
    });
  });

  it('should handle security violations appropriately', async () => {
    // Mock security violation
    mockValidateAccess.mockRejectedValueOnce(new Error('Access denied'));

    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.timeline-error')).toBeInTheDocument();
      expect(mockAuditLogger).toHaveBeenCalledWith({
        action: 'TIMELINE_INIT_ERROR',
        evidenceId: 'evidence-123',
        error: expect.any(Error)
      });
    });
  });

  it('should cleanup securely on unmount', async () => {
    const { unmount } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={mockSecurityContext}
      />
    );

    unmount();

    await waitFor(() => {
      // Verify timeline instance is destroyed
      expect(mockAuditLogger).toHaveBeenCalledWith({
        action: 'TIMELINE_DESTROYED',
        evidenceId: 'evidence-123',
        userId: mockSecurityContext.userId
      });
    });
  });

  it('should validate FedRAMP compliance requirements', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={{
          ...mockSecurityContext,
          classificationLevel: 'FEDRAMP_HIGH'
        }}
      />
    );

    await waitFor(() => {
      expect(mockValidateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          classificationLevel: 'FEDRAMP_HIGH'
        }),
        'INIT_TIMELINE'
      );
    });
  });

  it('should validate CJIS compliance requirements', async () => {
    const { container } = renderWithProviders(
      <Timeline 
        evidenceId="evidence-123"
        securityContext={{
          ...mockSecurityContext,
          jurisdiction: 'FEDERAL'
        }}
      />
    );

    await waitFor(() => {
      expect(mockValidateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          jurisdiction: 'FEDERAL'
        }),
        'INIT_TIMELINE'
      );
    });
  });
});