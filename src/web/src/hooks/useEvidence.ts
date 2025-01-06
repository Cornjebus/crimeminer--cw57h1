/**
 * Custom React hook for secure evidence management operations in CrimeMiner.
 * Implements FedRAMP High and CJIS compliance requirements.
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useContext } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { logAuditEvent } from '@crimeminer/audit-logger'; // v1.0.0

import {
  uploadEvidence,
  getEvidence,
  getEvidenceList,
  validateSecurityClassification,
  trackChainOfCustody
} from '../services/api/evidence.api';

import {
  Evidence,
  SecurityClassification,
  ChainOfCustody,
  EvidenceMediaType,
  EvidenceStatus
} from '../types/evidence.types';

/**
 * Interface for hook return value with comprehensive evidence management capabilities
 */
interface UseEvidenceReturn {
  // State
  loading: boolean;
  error: string | null;
  evidence: Evidence[];
  selectedEvidence: Evidence | null;
  securityClassification: SecurityClassification;
  chainOfCustody: ChainOfCustody[];
  totalItems: number;
  currentPage: number;

  // Actions
  uploadEvidence: (file: File, metadata: any) => Promise<void>;
  getEvidence: (id: string) => Promise<Evidence>;
  getEvidenceList: (page: number, limit: number) => Promise<void>;
  validateSecurity: (evidence: Evidence) => Promise<boolean>;
  trackCustody: (action: string) => Promise<void>;
}

/**
 * Custom hook for secure evidence management with CJIS compliance
 */
export default function useEvidence(): UseEvidenceReturn {
  // State management
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [securityClassification, setSecurityClassification] = useState<SecurityClassification>(
    SecurityClassification.UNCLASSIFIED
  );
  const [chainOfCustody, setChainOfCustody] = useState<ChainOfCustody[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Redux setup
  const dispatch = useDispatch();

  /**
   * Handles secure evidence upload with compliance validation
   */
  const handleSecureUpload = useCallback(async (file: File, metadata: any): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Validate security classification
      const securityLevel = await validateSecurityClassification({
        fileType: file.type,
        fileSize: file.size,
        metadata
      });

      // Initialize chain of custody
      const custodyEntry = {
        timestamp: new Date(),
        action: 'UPLOAD_INITIATED',
        userId: localStorage.getItem('userId'),
        fileHash: await generateFileHash(file)
      };

      // Log audit event
      await logAuditEvent({
        eventType: 'EVIDENCE_UPLOAD_INITIATED',
        evidenceMetadata: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          securityLevel
        }
      });

      // Perform secure upload
      const response = await uploadEvidence({
        file,
        metadata,
        securityClassification: securityLevel,
        chainOfCustody: custodyEntry
      });

      // Update chain of custody
      await trackChainOfCustody({
        evidenceId: response.data.id,
        action: 'UPLOAD_COMPLETED',
        timestamp: new Date()
      });

      // Log completion
      await logAuditEvent({
        eventType: 'EVIDENCE_UPLOAD_COMPLETED',
        evidenceId: response.data.id
      });

      setEvidence(prev => [...prev, response.data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence upload failed');
      await logAuditEvent({
        eventType: 'EVIDENCE_UPLOAD_FAILED',
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Retrieves evidence details with security validation
   */
  const handleSecureEvidence = useCallback(async (id: string): Promise<Evidence> => {
    try {
      setLoading(true);
      setError(null);

      // Log access attempt
      await logAuditEvent({
        eventType: 'EVIDENCE_ACCESS_ATTEMPTED',
        evidenceId: id
      });

      const response = await getEvidence(id);

      // Validate security clearance
      await validateSecurity(response.data);

      // Update chain of custody
      await trackChainOfCustody({
        evidenceId: id,
        action: 'EVIDENCE_ACCESSED',
        timestamp: new Date()
      });

      setSelectedEvidence(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve evidence');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Retrieves paginated evidence list with security filtering
   */
  const handleSecureEvidenceList = useCallback(async (page: number, limit: number): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const response = await getEvidenceList(page, limit);

      setEvidence(response.data.items);
      setTotalItems(response.data.total);
      setCurrentPage(page);

      // Log successful retrieval
      await logAuditEvent({
        eventType: 'EVIDENCE_LIST_RETRIEVED',
        page,
        limit,
        totalItems: response.data.total
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve evidence list');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Validates evidence security classification
   */
  const validateSecurity = useCallback(async (evidence: Evidence): Promise<boolean> => {
    try {
      const isValid = await validateSecurityClassification(evidence);
      if (!isValid) {
        throw new Error('Invalid security classification');
      }
      return true;
    } catch (err) {
      await logAuditEvent({
        eventType: 'SECURITY_VALIDATION_FAILED',
        evidenceId: evidence.id,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      throw err;
    }
  }, []);

  /**
   * Generates cryptographic hash of file for integrity validation
   */
  const generateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return {
    // State
    loading,
    error,
    evidence,
    selectedEvidence,
    securityClassification,
    chainOfCustody,
    totalItems,
    currentPage,

    // Actions
    uploadEvidence: handleSecureUpload,
    getEvidence: handleSecureEvidence,
    getEvidenceList: handleSecureEvidenceList,
    validateSecurity,
    trackCustody: trackChainOfCustody
  };
}