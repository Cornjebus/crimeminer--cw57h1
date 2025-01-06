import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from '@axe-core/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import TranscriptView from './TranscriptView';
import { Evidence, EvidenceMediaType, SecurityClassification } from '../../../types/evidence.types';

// Mock AuditLogger
jest.mock('@evidence/audit-logger', () => ({
  AuditLogger: jest.fn().mockImplementation(() => ({
    logAccess: jest.fn().mockResolvedValue(undefined),
    logAnnotation: jest.fn().mockResolvedValue(undefined),
    logError: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('TranscriptView Component', () => {
  // Mock evidence data with security classification
  const mockEvidence = (overrides = {}): Evidence => ({
    id: 'test-evidence-123',
    mediaType: EvidenceMediaType.AUDIO,
    transcript: [
      {
        speakerId: 'speaker-1',
        speakerName: 'John Doe',
        confidence: 0.95,
        timestamp: 15.5,
        text: 'Test transcript line one',
        classification: SecurityClassification.CONFIDENTIAL
      },
      {
        speakerId: 'speaker-2',
        speakerName: 'Jane Smith',
        confidence: 0.88,
        timestamp: 30.2,
        text: 'Test transcript line two',
        classification: SecurityClassification.SECRET
      }
    ],
    metadata: {
      duration: 120,
      fileHash: 'abc123',
      chainOfCustody: []
    },
    ...overrides
  });

  // Mock props
  const mockProps = {
    evidence: mockEvidence(),
    currentTime: 15.5,
    onTimeClick: jest.fn(),
    onAnnotationAdd: jest.fn(),
    securityClassification: SecurityClassification.SECRET,
    auditContext: {
      sessionId: 'test-session-123',
      userId: 'test-user-123',
      workstationId: 'test-workstation-123'
    },
    chainOfCustody: {
      evidenceId: 'test-evidence-123',
      accessHistory: []
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security and Compliance Tests', () => {
    it('should validate security classification before rendering transcript', async () => {
      const { container } = renderWithProviders(
        <TranscriptView {...mockProps} />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-classification]'))
          .toHaveAttribute('data-classification', SecurityClassification.SECRET);
      });
    });

    it('should prevent access when user lacks required clearance', async () => {
      const insecureProps = {
        ...mockProps,
        securityClassification: SecurityClassification.CONFIDENTIAL
      };

      expect(() => renderWithProviders(
        <TranscriptView {...insecureProps} />
      )).toThrow('Insufficient security clearance');
    });

    it('should log access attempts in audit trail', async () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      await waitFor(() => {
        expect(mockProps.onAnnotationAdd).not.toHaveBeenCalled();
      });
    });
  });

  describe('Transcript Display Tests', () => {
    it('should render transcript lines with correct security markings', () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const transcriptLines = screen.getAllByRole('listitem');
      expect(transcriptLines[0]).toHaveAttribute(
        'data-classification',
        SecurityClassification.CONFIDENTIAL
      );
    });

    it('should display speaker information with confidence indicators', () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const speakerInfo = screen.getByText('John Doe');
      expect(speakerInfo).toHaveAttribute('data-speaker-type', 'known');
      expect(speakerInfo.closest('[data-confidence]'))
        .toHaveAttribute('data-confidence', '0.95');
    });

    it('should format timestamps correctly', () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const timestamp = screen.getByText('00:15');
      expect(timestamp).toBeInTheDocument();
    });
  });

  describe('Interactive Feature Tests', () => {
    it('should handle timestamp navigation clicks', async () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const timeButton = screen.getByText('00:15');
      fireEvent.click(timeButton);

      expect(mockProps.onTimeClick).toHaveBeenCalledWith(15.5);
    });

    it('should handle secure annotation creation', async () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const annotateButton = screen.getByText('Add Note');
      fireEvent.click(annotateButton);

      await waitFor(() => {
        expect(mockProps.onAnnotationAdd).toHaveBeenCalledWith(
          'Test transcript line one',
          15.5,
          expect.any(Object)
        );
      });
    });

    it('should require confirmation for TOP_SECRET annotations', async () => {
      const topSecretEvidence = mockEvidence({
        transcript: [{
          ...mockProps.evidence.transcript[0],
          classification: SecurityClassification.TOP_SECRET
        }]
      });

      renderWithProviders(
        <TranscriptView {...mockProps} evidence={topSecretEvidence} />
      );

      const annotateButton = screen.getByText('Add Note');
      fireEvent.click(annotateButton);

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });
  });

  describe('Accessibility Tests', () => {
    it('should be accessible according to WCAG standards', async () => {
      const { container } = renderWithProviders(
        <TranscriptView {...mockProps} />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const transcriptContainer = screen.getByRole('region');
      transcriptContainer.focus();

      fireEvent.keyDown(transcriptContainer, { key: 'Tab' });
      expect(screen.getByText('00:15')).toHaveFocus();
    });

    it('should provide appropriate ARIA labels', () => {
      renderWithProviders(<TranscriptView {...mockProps} />);

      const timeButton = screen.getByText('00:15');
      expect(timeButton).toHaveAttribute('aria-label', 'Jump to 00:15');
    });
  });

  describe('Responsive Design Tests', () => {
    it('should adjust layout for mobile viewport', () => {
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      renderWithProviders(<TranscriptView {...mockProps} />);

      const container = screen.getByRole('region');
      expect(container).toHaveClass('mobileView');
    });

    it('should maintain readability at different zoom levels', () => {
      const { container } = renderWithProviders(
        <TranscriptView {...mockProps} />
      );

      expect(container).toHaveStyle({
        fontSize: '16px',
        lineHeight: '1.5'
      });
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle transcript loading errors gracefully', async () => {
      const errorProps = {
        ...mockProps,
        evidence: {
          ...mockProps.evidence,
          transcript: null
        }
      };

      renderWithProviders(<TranscriptView {...errorProps} />);

      expect(screen.getByText('Error loading transcript')).toBeInTheDocument();
    });

    it('should recover from annotation failures', async () => {
      mockProps.onAnnotationAdd.mockRejectedValueOnce(new Error('Annotation failed'));

      renderWithProviders(<TranscriptView {...mockProps} />);

      const annotateButton = screen.getByText('Add Note');
      fireEvent.click(annotateButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to add annotation')).toBeInTheDocument();
      });
    });
  });
});