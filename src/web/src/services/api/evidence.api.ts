/**
 * Evidence API service implementing FedRAMP High and CJIS compliance requirements
 * for secure evidence management and chain of custody tracking.
 * @version 1.0.0
 */

import { AxiosResponse, AxiosError } from 'axios'; // v1.6.0
import { 
  Evidence, 
  EvidenceCreateRequest, 
  EvidenceResponse, 
  EvidenceListResponse,
  EvidenceSecurityLevel 
} from '../../types/evidence.types';
import { apiClient } from '../../config/api.config';
import { API_ENDPOINTS, API_HEADERS } from '../../constants/api.constants';

/**
 * Uploads new evidence with comprehensive security validation and chain of custody tracking
 * @param request - Evidence creation metadata
 * @param file - Evidence file to upload
 * @param securityLevel - Required security classification level
 * @returns Promise resolving to evidence creation response with audit trail
 */
export async function uploadEvidence(
  request: EvidenceCreateRequest,
  file: File,
  securityLevel: EvidenceSecurityLevel
): Promise<AxiosResponse<EvidenceResponse>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('metadata', JSON.stringify(request));
  formData.append('securityLevel', securityLevel);

  // Add enhanced security headers
  const headers = {
    [API_HEADERS.CONTENT_TYPE]: 'multipart/form-data',
    [API_HEADERS.CLASSIFICATION_LEVEL]: securityLevel,
    [API_HEADERS.CHAIN_OF_CUSTODY]: generateChainOfCustody(file)
  };

  try {
    const response = await apiClient.post<EvidenceResponse>(
      API_ENDPOINTS.EVIDENCE.UPLOAD,
      formData,
      { headers }
    );

    // Validate upload response
    await validateEvidenceResponse(response.data);
    
    return response;
  } catch (error) {
    throw handleEvidenceError(error as AxiosError);
  }
}

/**
 * Retrieves evidence by ID with security clearance validation
 * @param id - Evidence identifier
 * @param requiredClearance - Required security clearance level
 * @returns Promise resolving to evidence details with security metadata
 */
export async function getEvidenceById(
  id: string,
  requiredClearance: EvidenceSecurityLevel
): Promise<AxiosResponse<EvidenceResponse>> {
  const headers = {
    [API_HEADERS.CLASSIFICATION_LEVEL]: requiredClearance
  };

  try {
    const response = await apiClient.get<EvidenceResponse>(
      `${API_ENDPOINTS.EVIDENCE.BASE}/${id}`,
      { headers }
    );

    await validateEvidenceAccess(response.data, requiredClearance);
    
    return response;
  } catch (error) {
    throw handleEvidenceError(error as AxiosError);
  }
}

/**
 * Retrieves paginated evidence list with security filtering
 * @param page - Page number
 * @param limit - Items per page
 * @param caseId - Optional case identifier filter
 * @param maxSecurityLevel - Maximum security level filter
 * @returns Promise resolving to filtered evidence list
 */
export async function getEvidenceList(
  page: number,
  limit: number,
  caseId?: string,
  maxSecurityLevel?: EvidenceSecurityLevel
): Promise<AxiosResponse<EvidenceListResponse>> {
  const params = {
    page,
    limit,
    caseId,
    maxSecurityLevel
  };

  const headers = {
    [API_HEADERS.CLASSIFICATION_LEVEL]: maxSecurityLevel
  };

  try {
    const response = await apiClient.get<EvidenceListResponse>(
      API_ENDPOINTS.EVIDENCE.BASE,
      { params, headers }
    );

    await validateEvidenceList(response.data, maxSecurityLevel);
    
    return response;
  } catch (error) {
    throw handleEvidenceError(error as AxiosError);
  }
}

/**
 * Updates evidence status with comprehensive audit logging
 * @param id - Evidence identifier
 * @param status - New evidence status
 * @param auditNote - Required audit note for change
 * @returns Promise resolving to updated evidence with audit trail
 */
export async function updateEvidenceStatus(
  id: string,
  status: string,
  auditNote: string
): Promise<AxiosResponse<EvidenceResponse>> {
  const payload = {
    status,
    auditNote,
    timestamp: new Date().toISOString()
  };

  const headers = {
    [API_HEADERS.AUDIT_USER_ID]: localStorage.getItem('userId'),
    [API_HEADERS.CHAIN_OF_CUSTODY]: generateChainOfCustody(payload)
  };

  try {
    const response = await apiClient.put<EvidenceResponse>(
      `${API_ENDPOINTS.EVIDENCE.BASE}/${id}/status`,
      payload,
      { headers }
    );

    await validateStatusUpdate(response.data, status);
    
    return response;
  } catch (error) {
    throw handleEvidenceError(error as AxiosError);
  }
}

/**
 * Deletes evidence with chain of custody validation
 * @param id - Evidence identifier
 * @param deletionReason - Required reason for deletion
 * @returns Promise resolving to deletion confirmation
 */
export async function deleteEvidence(
  id: string,
  deletionReason: string
): Promise<AxiosResponse<void>> {
  const headers = {
    [API_HEADERS.AUDIT_USER_ID]: localStorage.getItem('userId'),
    [API_HEADERS.CHAIN_OF_CUSTODY]: generateChainOfCustody({ id, deletionReason })
  };

  try {
    const response = await apiClient.delete(
      `${API_ENDPOINTS.EVIDENCE.BASE}/${id}`,
      {
        headers,
        data: { deletionReason }
      }
    );

    await logEvidenceDeletion(id, deletionReason);
    
    return response;
  } catch (error) {
    throw handleEvidenceError(error as AxiosError);
  }
}

/**
 * Generates chain of custody hash for evidence operations
 */
function generateChainOfCustody(data: any): string {
  const timestamp = new Date().toISOString();
  const userId = localStorage.getItem('userId');
  const payload = `${timestamp}:${userId}:${JSON.stringify(data)}`;
  
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
    .then(hash => Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''));
}

/**
 * Validates evidence response against security requirements
 */
async function validateEvidenceResponse(evidence: Evidence): Promise<void> {
  if (!evidence.classificationLevel || !evidence.securityControls) {
    throw new Error('Invalid evidence security metadata');
  }
  
  if (!evidence.chainOfCustody || evidence.chainOfCustody.length === 0) {
    throw new Error('Missing chain of custody information');
  }
}

/**
 * Validates evidence access against security clearance
 */
async function validateEvidenceAccess(
  evidence: Evidence,
  clearance: EvidenceSecurityLevel
): Promise<void> {
  if (!evidence.classificationLevel || 
      evidence.classificationLevel > clearance) {
    throw new Error('Insufficient security clearance');
  }
}

/**
 * Validates evidence list against security requirements
 */
async function validateEvidenceList(
  response: EvidenceListResponse,
  maxLevel?: EvidenceSecurityLevel
): Promise<void> {
  if (maxLevel) {
    response.items = response.items.filter(
      item => item.classificationLevel <= maxLevel
    );
  }
}

/**
 * Validates evidence status update
 */
async function validateStatusUpdate(
  evidence: Evidence,
  newStatus: string
): Promise<void> {
  if (!evidence.status || evidence.status !== newStatus) {
    throw new Error('Status update validation failed');
  }
}

/**
 * Logs evidence deletion to audit trail
 */
async function logEvidenceDeletion(
  id: string,
  reason: string
): Promise<void> {
  await apiClient.post(API_ENDPOINTS.AUDIT.EVENTS, {
    eventType: 'EVIDENCE_DELETION',
    evidenceId: id,
    reason,
    timestamp: new Date().toISOString(),
    userId: localStorage.getItem('userId')
  });
}

/**
 * Handles evidence-specific API errors
 */
function handleEvidenceError(error: AxiosError): Error {
  // Log security-related errors
  if (error.response?.status === 401 || error.response?.status === 403) {
    logSecurityEvent(error);
  }
  
  return error;
}

/**
 * Logs security events to audit trail
 */
function logSecurityEvent(error: AxiosError): void {
  apiClient.post(API_ENDPOINTS.AUDIT.EVENTS, {
    eventType: 'SECURITY_VIOLATION',
    error: error.message,
    timestamp: new Date().toISOString(),
    userId: localStorage.getItem('userId')
  }).catch(console.error);
}