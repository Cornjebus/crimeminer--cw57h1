/**
 * @fileoverview TypeScript type definitions for evidence analysis functionality
 * Provides comprehensive type safety for multimedia evidence processing and analysis
 * Version: 1.0.0
 */

/**
 * Supported evidence media types
 */
export enum MediaType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT'
}

/**
 * Supported analysis types for evidence processing
 */
export enum AnalysisType {
  TRANSCRIPTION = 'TRANSCRIPTION',
  SPEAKER_ID = 'SPEAKER_ID',
  LANGUAGE_DETECTION = 'LANGUAGE_DETECTION',
  OBJECT_DETECTION = 'OBJECT_DETECTION',
  FACE_DETECTION = 'FACE_DETECTION',
  OCR = 'OCR',
  ENTITY_EXTRACTION = 'ENTITY_EXTRACTION'
}

/**
 * Time segment representation for temporal analysis results
 */
export interface TimeSegment {
  start: number;
  end: number;
  confidence: number;
}

/**
 * Spatial coordinates for visual analysis results
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Point coordinates for facial landmarks
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Analysis request configuration
 */
export interface AnalysisRequest {
  evidenceId: string;
  mediaType: MediaType;
  analysisTypes: AnalysisType[];
  options: Record<string, unknown>;
}

/**
 * Comprehensive type definition for analysis result content
 */
export type AnalysisContent = {
  transcription?: {
    text: string;
    segments: TimeSegment[];
    speakers?: string[];
  };
  speakers?: {
    id: string;
    segments: TimeSegment[];
    confidence: number;
    metadata?: Record<string, unknown>;
  }[];
  languages?: {
    code: string;
    confidence: number;
    segments?: TimeSegment[];
  }[];
  objects?: {
    label: string;
    bbox: BoundingBox;
    confidence: number;
    trackId?: string;
    segments?: TimeSegment[];
  }[];
  faces?: {
    bbox: BoundingBox;
    landmarks: Point[];
    confidence: number;
    metadata?: Record<string, unknown>;
  }[];
  text?: {
    content: string;
    bbox: BoundingBox;
    confidence: number;
    language?: string;
  }[];
  entities?: {
    type: string;
    value: string;
    confidence: number;
    source: string;
    segments?: TimeSegment[];
    bbox?: BoundingBox;
    metadata?: Record<string, unknown>;
  }[];
}

/**
 * Complete analysis result with metadata
 */
export interface AnalysisResult {
  evidenceId: string;
  resultType: AnalysisType;
  content: AnalysisContent;
  confidence: number;
  processingTime: number;
  version: string;
  metadata: Record<string, unknown>;
}

/**
 * Analysis job status values
 */
export enum AnalysisJobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Analysis job status tracking
 */
export interface AnalysisStatus {
  jobId: string;
  status: AnalysisJobStatus;
  progress: number;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  estimatedTimeRemaining: number;
  startTime: string;
  lastUpdated: string;
}