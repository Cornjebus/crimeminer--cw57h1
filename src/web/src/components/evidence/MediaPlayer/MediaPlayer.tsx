/**
 * Secure media player component for evidence playback with FedRAMP High and CJIS compliance.
 * Implements comprehensive audit logging, accessibility features, and chain of custody tracking.
 * @version 1.0.0
 */

import React, { useRef, useState, useEffect } from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.2
import { useFocusRing } from '@react-aria/focus'; // v3.0.0

import { Evidence, EvidenceMediaType, SecurityClassification } from '../../../types/evidence.types';
import useEvidence from '../../../hooks/useEvidence';

// Supported media types with CJIS compliance
const SUPPORTED_MEDIA_TYPES = ['video/mp4', 'video/webm', 'audio/mp3', 'audio/wav', 'audio/ogg'];

// Security classification levels
const SECURITY_LEVELS = ['UNCLASSIFIED', 'SENSITIVE', 'CONFIDENTIAL', 'SECRET'];

// Audit event types
const AUDIT_EVENTS = {
  PLAYBACK_START: 'PLAYBACK_START',
  PLAYBACK_PAUSE: 'PLAYBACK_PAUSE',
  PLAYBACK_STOP: 'PLAYBACK_STOP',
  SEEK: 'SEEK',
  VOLUME_CHANGE: 'VOLUME_CHANGE'
} as const;

interface MediaPlayerProps {
  evidenceId: string;
  autoPlay?: boolean;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  className?: string;
  securityContext: {
    clearanceLevel: SecurityClassification;
    userId: string;
    sessionId: string;
  };
  highContrast?: boolean;
  auditCallback?: (event: AuditEvent) => void;
}

interface AuditEvent {
  type: keyof typeof AUDIT_EVENTS;
  timestamp: Date;
  evidenceId: string;
  userId: string;
  sessionId: string;
  details: Record<string, unknown>;
}

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  evidenceId,
  autoPlay = false,
  onTimeUpdate,
  onEnded,
  className,
  securityContext,
  highContrast = false,
  auditCallback
}) => {
  // Refs
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [securityValidated, setSecurityValidated] = useState(false);

  // Custom hooks
  const { getEvidence, logAuditEvent } = useEvidence();
  const { isFocusVisible, focusProps } = useFocusRing();

  // Load and validate evidence
  useEffect(() => {
    const loadEvidence = async () => {
      try {
        setIsLoading(true);
        const evidence = await getEvidence(evidenceId);
        
        // Validate security classification
        if (evidence.classificationLevel > securityContext.clearanceLevel) {
          throw new Error('Insufficient security clearance');
        }

        // Validate media type
        if (!SUPPORTED_MEDIA_TYPES.includes(evidence.metadata.mimeType)) {
          throw new Error('Unsupported media type');
        }

        setSecurityValidated(true);
        logSecurityEvent('MEDIA_ACCESS_GRANTED', evidence);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load media');
        logSecurityEvent('MEDIA_ACCESS_DENIED', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    loadEvidence();
  }, [evidenceId, securityContext]);

  // Format time display
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return '00:00:00';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Playback controls with audit logging
  const handlePlay = async () => {
    if (!securityValidated || !mediaRef.current) return;

    try {
      await mediaRef.current.play();
      setIsPlaying(true);
      logAuditEvent({
        type: AUDIT_EVENTS.PLAYBACK_START,
        timestamp: new Date(),
        evidenceId,
        userId: securityContext.userId,
        sessionId: securityContext.sessionId,
        details: { currentTime }
      });
    } catch (err) {
      setError('Playback failed');
      logSecurityEvent('PLAYBACK_ERROR', { error: err });
    }
  };

  const handlePause = () => {
    if (!securityValidated || !mediaRef.current) return;

    mediaRef.current.pause();
    setIsPlaying(false);
    logAuditEvent({
      type: AUDIT_EVENTS.PLAYBACK_PAUSE,
      timestamp: new Date(),
      evidenceId,
      userId: securityContext.userId,
      sessionId: securityContext.sessionId,
      details: { currentTime }
    });
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!securityValidated || !mediaRef.current || !progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;

    mediaRef.current.currentTime = newTime;
    setCurrentTime(newTime);

    logAuditEvent({
      type: AUDIT_EVENTS.SEEK,
      timestamp: new Date(),
      evidenceId,
      userId: securityContext.userId,
      sessionId: securityContext.sessionId,
      details: { previousTime: currentTime, newTime }
    });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!securityValidated || !mediaRef.current) return;

    const newVolume = parseFloat(e.target.value);
    mediaRef.current.volume = newVolume;
    setVolume(newVolume);

    logAuditEvent({
      type: AUDIT_EVENTS.VOLUME_CHANGE,
      timestamp: new Date(),
      evidenceId,
      userId: securityContext.userId,
      sessionId: securityContext.sessionId,
      details: { previousVolume: volume, newVolume }
    });
  };

  // Security event logging
  const logSecurityEvent = (type: string, details: Record<string, unknown>) => {
    auditCallback?.({
      type: type as keyof typeof AUDIT_EVENTS,
      timestamp: new Date(),
      evidenceId,
      userId: securityContext.userId,
      sessionId: securityContext.sessionId,
      details
    });
  };

  // Render loading state
  if (isLoading) {
    return <div className="media-player-loading">Loading secure media player...</div>;
  }

  // Render error state
  if (error) {
    return <div className="media-player-error">Error: {error}</div>;
  }

  // Main render
  return (
    <div 
      className={classNames(
        'media-player',
        { 'high-contrast': highContrast },
        className
      )}
      {...focusProps}
    >
      <div className="media-player-container">
        {/* Media element */}
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          className="media-player-element"
          onTimeUpdate={() => {
            const time = mediaRef.current?.currentTime || 0;
            setCurrentTime(time);
            onTimeUpdate?.(time);
          }}
          onDurationChange={() => {
            setDuration(mediaRef.current?.duration || 0);
          }}
          onEnded={() => {
            setIsPlaying(false);
            onEnded?.();
          }}
          autoPlay={autoPlay}
          playsInline
          controls={false}
        />

        {/* Custom controls */}
        <div className="media-player-controls">
          <button
            className="play-pause-button"
            onClick={isPlaying ? handlePause : handlePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>

          <div 
            ref={progressBarRef}
            className="progress-bar"
            onClick={handleSeek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
          >
            <div 
              className="progress-bar-fill"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div className="volume-control">
            <button
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;