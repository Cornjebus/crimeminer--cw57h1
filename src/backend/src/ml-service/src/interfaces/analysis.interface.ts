/**
 * @file Analysis interface definitions for CrimeMiner ML service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant interfaces for ML service
 * analysis functionality including request/response types, media types, and result structures
 */

import { IBaseEntity } from '../../../common/interfaces/base.interface';

/**
 * Supported evidence media types for CJIS-compliant processing
 */
export enum EvidenceMediaType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT'
}

/**
 * Supported analysis types with FedRAMP-compliant processing capabilities
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
 * Analysis status tracking for audit compliance
 */
export enum AnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Error information for failed analysis attempts
 */
export interface AnalysisError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Analysis request interface with enhanced priority and metadata support
 */
export interface IAnalysisRequest extends IBaseEntity {
  evidenceId: string;
  mediaType: EvidenceMediaType;
  analysisTypes: AnalysisType[];
  priority: number;
  metadata: Record<string, unknown>;
}

/**
 * Analysis result interface with comprehensive error handling and status tracking
 */
export interface IAnalysisResult extends IBaseEntity {
  evidenceId: string;
  resultType: AnalysisType;
  content: AnalysisContent;
  confidence: number;
  processingTime: number;
  status: AnalysisStatus;
  error?: AnalysisError;
}

/**
 * Comprehensive type definition for different analysis result content structures
 */
export type AnalysisContent = {
  // Audio transcription results with speaker diarization
  transcription?: {
    text: string;
    timestamps: {
      start: number;
      end: number;
      confidence: number;
    }[];
    speakers?: string[];
  };

  // Speaker identification results with temporal segments
  speakers?: {
    id: string;
    segments: {
      start: number;
      end: number;
      confidence: number;
    }[];
    metadata?: Record<string, unknown>;
  }[];

  // Language detection results with temporal segments
  languages?: {
    code: string;
    confidence: number;
    segments?: {
      start: number;
      end: number;
    }[];
  }[];

  // Object detection results with tracking
  objects?: {
    label: string;
    bbox: number[];
    confidence: number;
    tracking_id?: string;
    frame_timestamps?: number[];
  }[];

  // Face detection results with landmarks and tracking
  faces?: {
    bbox: number[];
    landmarks: number[][];
    confidence: number;
    tracking_id?: string;
    frame_timestamps?: number[];
    metadata?: Record<string, unknown>;
  }[];

  // OCR results with spatial information
  text?: {
    content: string;
    bbox: number[];
    confidence: number;
    language?: string;
    frame_timestamps?: number[];
  }[];

  // Entity extraction results with relationship mapping
  entities?: {
    type: string;
    value: string;
    confidence: number;
    relationships?: {
      target_id: string;
      relationship_type: string;
      confidence: number;
    }[];
    source_segments?: {
      start: number;
      end: number;
    }[];
  }[];
};

/**
 * Batch analysis request interface for processing multiple evidence items
 */
export interface IBatchAnalysisRequest extends IBaseEntity {
  evidenceIds: string[];
  mediaType: EvidenceMediaType;
  analysisTypes: AnalysisType[];
  priority: number;
  metadata: Record<string, unknown>;
}

/**
 * Analysis metrics interface for performance monitoring
 */
export interface IAnalysisMetrics {
  requestId: string;
  startTime: Date;
  endTime: Date;
  processingTime: number;
  resourceUtilization: {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage?: number;
  };
  modelMetrics?: {
    modelId: string;
    inferenceTime: number;
    confidence: number;
  };
}