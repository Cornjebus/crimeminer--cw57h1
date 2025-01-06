import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import MediaPlayer from './MediaPlayer';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { Evidence, EvidenceMediaType, SecurityClassification } from '../../../types/evidence.types';

// Mock HTML5 media element
beforeEach(() => {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn();
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

// Mock secure evidence data
const mockSecureEvidence = (overrides?: Partial<Evidence>, classification = SecurityClassification.CONFIDENTIAL): Evidence => ({
  id: 'test-evidence-id',
  caseId: 'test-case-id',
  mediaType: EvidenceMediaType.VIDEO,
  filePath: 'https://evidence-storage.crimeminer.gov/test.mp4',
  fileHash: 'sha256-hash',
  metadata: {
    originalFilename: 'test.mp4',
    fileSize: 1024,
    mimeType: 'video/mp4',
    duration: 300,
    resolution: { width: 1920, height: 1080 }
  },
  classificationLevel: classification,
  securityControls: [{
    controlId: 'FED-001',
    controlType: 'ACCESS_CONTROL',
    implementationStatus: 'IMPLEMENTED',
    lastAssessmentDate: new Date()
  }],
  chainOfCustody: [{
    timestamp: new Date(),
    fromUserId: 'system',
    toUserId: 'test-user',
    reason: 'Initial upload',
    signature: 'digital-signature',
    location: { latitude: 0, longitude: 0, accuracy: 0 }
  }],
  ...overrides
});

// Mock security context
const mockSecurityContext = {
  clearanceLevel: SecurityClassification.SECRET,
  userId: 'test-user-id',
  sessionId: 'test-session-id'
};

describe('Secure MediaPlayer Component', () => {
  // Security and compliance validation tests
  it('should verify security classification before playback', async () => {
    const auditCallback = vi.fn();
    const evidence = mockSecureEvidence();

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
        auditCallback={auditCallback}
      />
    );

    await waitFor(() => {
      expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'MEDIA_ACCESS_GRANTED',
        evidenceId: evidence.id,
        userId: mockSecurityContext.userId
      }));
    });
  });

  it('should prevent playback with insufficient clearance', async () => {
    const auditCallback = vi.fn();
    const evidence = mockSecureEvidence(undefined, SecurityClassification.SECRET);
    const lowClearanceContext = {
      ...mockSecurityContext,
      clearanceLevel: SecurityClassification.CONFIDENTIAL
    };

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={lowClearanceContext}
        auditCallback={auditCallback}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/insufficient security clearance/i)).toBeInTheDocument();
      expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'MEDIA_ACCESS_DENIED',
        evidenceId: evidence.id
      }));
    });
  });

  // Playback control tests with audit logging
  it('should log media access attempts to audit trail', async () => {
    const auditCallback = vi.fn();
    const evidence = mockSecureEvidence();

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
        auditCallback={auditCallback}
      />
    );

    const playButton = await screen.findByRole('button', { name: /play/i });
    await userEvent.click(playButton);

    expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PLAYBACK_START',
      evidenceId: evidence.id,
      userId: mockSecurityContext.userId,
      sessionId: mockSecurityContext.sessionId
    }));
  });

  it('should maintain chain of custody during playback', async () => {
    const auditCallback = vi.fn();
    const evidence = mockSecureEvidence();

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
        auditCallback={auditCallback}
      />
    );

    const playButton = await screen.findByRole('button', { name: /play/i });
    await userEvent.click(playButton);
    await userEvent.click(playButton); // Pause

    expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PLAYBACK_START'
    }));
    expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PLAYBACK_PAUSE'
    }));
  });

  // Accessibility compliance tests
  it('should support keyboard controls', async () => {
    const evidence = mockSecureEvidence();
    
    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
      />
    );

    const player = screen.getByRole('region', { name: /media player/i });
    const playButton = within(player).getByRole('button', { name: /play/i });

    await userEvent.tab();
    expect(playButton).toHaveFocus();

    await userEvent.keyboard(' '); // Space to play
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('should support screen reader announcements', async () => {
    const evidence = mockSecureEvidence();
    
    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
      />
    );

    const progressBar = screen.getByRole('slider', { name: /seek/i });
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax');
    expect(progressBar).toHaveAttribute('aria-valuenow');
  });

  it('should enforce high contrast requirements', async () => {
    const evidence = mockSecureEvidence();
    
    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
        highContrast={true}
      />
    );

    const player = screen.getByRole('region', { name: /media player/i });
    expect(player).toHaveClass('high-contrast');
  });

  // Media integrity tests
  it('should validate media integrity', async () => {
    const evidence = mockSecureEvidence({
      fileHash: 'invalid-hash'
    });

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/media validation failed/i)).toBeInTheDocument();
    });
  });

  // Error handling tests
  it('should handle security-related errors', async () => {
    const auditCallback = vi.fn();
    const evidence = mockSecureEvidence();

    window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue(new Error('Playback failed'));

    renderWithProviders(
      <MediaPlayer 
        evidenceId={evidence.id}
        securityContext={mockSecurityContext}
        auditCallback={auditCallback}
      />
    );

    const playButton = await screen.findByRole('button', { name: /play/i });
    await userEvent.click(playButton);

    await waitFor(() => {
      expect(screen.getByText(/playback failed/i)).toBeInTheDocument();
      expect(auditCallback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'PLAYBACK_ERROR'
      }));
    });
  });
});