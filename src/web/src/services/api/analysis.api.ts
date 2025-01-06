/**
 * API client methods for evidence analysis processing with FedRAMP High and CJIS compliance
 * Implements secure multimedia evidence processing with comprehensive error handling
 * @version 1.0.0
 */

import { apiClient } from '../../config/api.config';
import { API_ENDPOINTS } from '../../constants/api.constants';
import {
  MediaType,
  AnalysisType,
  AnalysisRequest,
  AnalysisResult,
  AnalysisStatus,
  BatchAnalysisRequest,
  SecurityContext
} from '../../types/analysis.types';

/**
 * Submits evidence for analysis processing with enhanced security validation
 * @param request Analysis request configuration
 * @param securityContext Security context for request
 * @returns Promise resolving to job ID
 */
export async function submitAnalysis(
  request: AnalysisRequest,
  securityContext: SecurityContext
): Promise<string> {
  try {
    // Validate request parameters
    validateAnalysisRequest(request);

    // Apply security headers
    const headers = {
      'X-Classification-Level': determineClassificationLevel(request.mediaType),
      'X-Chain-Of-Custody': generateChainOfCustody(request.evidenceId),
      ...securityContext.headers
    };

    const response = await apiClient.post(
      API_ENDPOINTS.ANALYSIS.TRANSCRIBE,
      request,
      { headers }
    );

    return response.data.jobId;
  } catch (error) {
    throw enhanceError(error, 'Failed to submit analysis request');
  }
}

/**
 * Submits multiple evidence items for batch processing
 * @param batchRequest Batch analysis request configuration
 * @param securityContext Security context for request
 * @returns Promise resolving to array of job IDs
 */
export async function submitBatchAnalysis(
  batchRequest: BatchAnalysisRequest,
  securityContext: SecurityContext
): Promise<string[]> {
  try {
    // Validate batch request
    validateBatchRequest(batchRequest);

    // Apply security headers with batch context
    const headers = {
      'X-Classification-Level': 'CJIS',
      'X-Batch-ID': crypto.randomUUID(),
      ...securityContext.headers
    };

    const response = await apiClient.post(
      API_ENDPOINTS.ANALYSIS.TRANSCRIBE,
      batchRequest,
      {
        headers,
        timeout: 600000 // 10 minutes for batch processing
      }
    );

    return response.data.jobIds;
  } catch (error) {
    throw enhanceError(error, 'Failed to submit batch analysis request');
  }
}

/**
 * Retrieves current status of an analysis job with progress tracking
 * @param jobId Analysis job identifier
 * @param securityContext Security context for request
 * @returns Promise resolving to analysis status
 */
export async function getAnalysisStatus(
  jobId: string,
  securityContext: SecurityContext
): Promise<AnalysisStatus> {
  try {
    validateJobId(jobId);

    const headers = {
      'X-Job-ID': jobId,
      ...securityContext.headers
    };

    const response = await apiClient.get(
      `${API_ENDPOINTS.ANALYSIS.TRANSCRIBE}/status/${jobId}`,
      { headers }
    );

    return response.data;
  } catch (error) {
    throw enhanceError(error, 'Failed to retrieve analysis status');
  }
}

/**
 * Retrieves results of completed analysis with security validation
 * @param evidenceId Evidence identifier
 * @param resultType Type of analysis result to retrieve
 * @param securityContext Security context for request
 * @returns Promise resolving to analysis results
 */
export async function getAnalysisResults(
  evidenceId: string,
  resultType: AnalysisType,
  securityContext: SecurityContext
): Promise<AnalysisResult> {
  try {
    validateEvidenceId(evidenceId);
    validateResultType(resultType);

    const headers = {
      'X-Evidence-ID': evidenceId,
      'X-Result-Type': resultType,
      ...securityContext.headers
    };

    const response = await apiClient.get(
      `${API_ENDPOINTS.ANALYSIS.TRANSCRIBE}/results/${evidenceId}`,
      {
        headers,
        params: { type: resultType }
      }
    );

    return sanitizeResults(response.data);
  } catch (error) {
    throw enhanceError(error, 'Failed to retrieve analysis results');
  }
}

// Helper Functions

function validateAnalysisRequest(request: AnalysisRequest): void {
  if (!request.evidenceId || !request.mediaType || !request.analysisTypes?.length) {
    throw new Error('Invalid analysis request parameters');
  }
  
  if (!Object.values(MediaType).includes(request.mediaType)) {
    throw new Error('Invalid media type specified');
  }

  request.analysisTypes.forEach(type => {
    if (!Object.values(AnalysisType).includes(type)) {
      throw new Error(`Invalid analysis type: ${type}`);
    }
  });
}

function validateBatchRequest(request: BatchAnalysisRequest): void {
  if (!request.items?.length) {
    throw new Error('Batch request must contain at least one item');
  }

  request.items.forEach(validateAnalysisRequest);
}

function validateJobId(jobId: string): void {
  if (!jobId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
    throw new Error('Invalid job ID format');
  }
}

function validateEvidenceId(evidenceId: string): void {
  if (!evidenceId?.match(/^[A-Za-z0-9-_]{1,64}$/)) {
    throw new Error('Invalid evidence ID format');
  }
}

function validateResultType(resultType: AnalysisType): void {
  if (!Object.values(AnalysisType).includes(resultType)) {
    throw new Error('Invalid result type specified');
  }
}

function determineClassificationLevel(mediaType: MediaType): string {
  return mediaType === MediaType.TEXT ? 'FEDRAMP_HIGH' : 'CJIS';
}

function generateChainOfCustody(evidenceId: string): string {
  const timestamp = new Date().toISOString();
  const data = `${evidenceId}:${timestamp}`;
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    .then(hash => Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''));
}

function sanitizeResults(results: AnalysisResult): AnalysisResult {
  // Remove sensitive metadata
  if (results.metadata) {
    delete results.metadata.internalNotes;
    delete results.metadata.systemDetails;
  }
  
  // Redact potentially sensitive information from transcriptions
  if (results.content.transcription) {
    results.content.transcription.text = redactSensitiveInfo(
      results.content.transcription.text
    );
  }

  return results;
}

function enhanceError(error: any, context: string): Error {
  const enhancedError = new Error(`${context}: ${error.message}`);
  enhancedError.name = 'AnalysisError';
  return enhancedError;
}

function redactSensitiveInfo(text: string): string {
  // Implement PII redaction logic here
  return text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]')
    .replace(/\b\d{16}\b/g, '[REDACTED-CCN]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED-EMAIL]');
}