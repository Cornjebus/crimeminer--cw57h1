/**
 * CaseDetails component implementing FedRAMP High and CJIS compliance requirements
 * for secure case information display and management.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'; // v18.0.0
import { format } from 'date-fns'; // v2.30.0
import { audit-logger as AuditLogger } from '@company/audit-logger'; // v1.0.0
import { SecurityContext } from '@company/security-context'; // v2.0.0

import useCase from '../../../hooks/useCase';
import {
  Case,
  CaseStatus,
  CaseUpdateRequest,
  SecurityClassification
} from '../../../types/case.types';

// Initialize audit logger
const auditLogger = new AuditLogger();

interface CaseDetailsProps {
  caseId: string;
  onClose: () => void;
  securityContext: SecurityContext;
}

export const CaseDetails: React.FC<CaseDetailsProps> = ({
  caseId,
  onClose,
  securityContext
}) => {
  // Hook into case management functionality
  const {
    selectedCase,
    loading,
    updateCase,
    deleteCase,
    subscribeToUpdates
  } = useCase();

  // Local state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Case>>({});
  const [securityViolations, setSecurityViolations] = useState<string[]>([]);

  // WebSocket connection ref
  const wsRef = useRef<WebSocket | null>(null);

  /**
   * Security validation for case access
   */
  const validateSecurity = useCallback(async () => {
    try {
      const violations = await securityContext.validateAccess({
        resourceType: 'CASE',
        resourceId: caseId,
        action: 'VIEW',
        classification: selectedCase?.securityClassification
      });

      setSecurityViolations(violations);
      return violations.length === 0;
    } catch (error) {
      console.error('Security validation failed:', error);
      return false;
    }
  }, [caseId, selectedCase, securityContext]);

  /**
   * Handle case updates with security validation and audit logging
   */
  const handleUpdateCase = async (data: CaseUpdateRequest) => {
    try {
      // Validate security context
      if (!await validateSecurity()) {
        throw new Error('Security validation failed');
      }

      // Update case
      await updateCase({
        id: caseId,
        ...data
      });

      // Log audit event
      await auditLogger.log({
        action: 'UPDATE_CASE',
        resourceId: caseId,
        userId: securityContext.userId,
        changes: data,
        timestamp: new Date(),
        securityLevel: selectedCase?.securityClassification
      });

      setIsEditing(false);
      setEditData({});
    } catch (error) {
      console.error('Failed to update case:', error);
      throw error;
    }
  };

  /**
   * Handle case deletion with security checks
   */
  const handleDeleteCase = async () => {
    try {
      if (!await validateSecurity()) {
        throw new Error('Security validation failed');
      }

      await deleteCase(caseId);

      await auditLogger.log({
        action: 'DELETE_CASE',
        resourceId: caseId,
        userId: securityContext.userId,
        timestamp: new Date(),
        securityLevel: selectedCase?.securityClassification
      });

      onClose();
    } catch (error) {
      console.error('Failed to delete case:', error);
      throw error;
    }
  };

  /**
   * Handle real-time updates via WebSocket
   */
  const handleRealTimeUpdate = useCallback((update: any) => {
    if (update.caseId === caseId) {
      auditLogger.log({
        action: 'REALTIME_UPDATE',
        resourceId: caseId,
        userId: securityContext.userId,
        changes: update,
        timestamp: new Date()
      });
    }
  }, [caseId, securityContext.userId]);

  // Set up WebSocket connection
  useEffect(() => {
    if (caseId && securityContext.isValid) {
      subscribeToUpdates(caseId);
      
      wsRef.current = new WebSocket(
        `${process.env.REACT_APP_WS_URL}/cases/${caseId}`,
        {
          headers: {
            'Authorization': `Bearer ${securityContext.token}`,
            'X-Security-Level': selectedCase?.securityClassification
          }
        }
      );

      wsRef.current.onmessage = (event) => {
        handleRealTimeUpdate(JSON.parse(event.data));
      };

      return () => {
        wsRef.current?.close();
      };
    }
  }, [caseId, securityContext, handleRealTimeUpdate, subscribeToUpdates]);

  // Validate security on component mount and case changes
  useEffect(() => {
    validateSecurity();
  }, [validateSecurity, selectedCase]);

  if (loading) {
    return <div>Loading case details...</div>;
  }

  if (securityViolations.length > 0) {
    return (
      <div className="security-violation">
        <h3>Access Denied</h3>
        <ul>
          {securityViolations.map((violation, index) => (
            <li key={index}>{violation}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (!selectedCase) {
    return <div>Case not found</div>;
  }

  return (
    <div className="case-details" data-testid="case-details">
      <div className="case-header">
        <div className="security-classification">
          Classification: {selectedCase.securityClassification}
        </div>
        <h2>{selectedCase.title}</h2>
        <div className="case-metadata">
          <span>ID: {selectedCase.id}</span>
          <span>Status: {selectedCase.status}</span>
          <span>Created: {format(new Date(selectedCase.createdAt), 'PPpp')}</span>
        </div>
      </div>

      <div className="case-content">
        {isEditing ? (
          <div className="edit-form">
            <input
              type="text"
              value={editData.title || selectedCase.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              aria-label="Case title"
            />
            <textarea
              value={editData.description || selectedCase.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              aria-label="Case description"
            />
            <select
              value={editData.status || selectedCase.status}
              onChange={(e) => setEditData({ ...editData, status: e.target.value as CaseStatus })}
              aria-label="Case status"
            >
              {Object.values(CaseStatus).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <div className="action-buttons">
              <button
                onClick={() => handleUpdateCase(editData)}
                aria-label="Save changes"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditData({});
                }}
                aria-label="Cancel editing"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="case-description">
              <h3>Description</h3>
              <p>{selectedCase.description}</p>
            </div>
            <div className="case-evidence">
              <h3>Evidence Items</h3>
              <p>{selectedCase.metadata.evidenceCount || 0} items</p>
            </div>
            <div className="case-team">
              <h3>Team Members</h3>
              <ul>
                {selectedCase.metadata.teamMembers?.map((member: any) => (
                  <li key={member.id}>{member.name}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      <div className="case-actions">
        {!isEditing && (
          <>
            <button
              onClick={() => setIsEditing(true)}
              aria-label="Edit case"
              disabled={!securityContext.canEdit}
            >
              Edit Case
            </button>
            <button
              onClick={handleDeleteCase}
              aria-label="Delete case"
              disabled={!securityContext.canDelete}
              className="delete-button"
            >
              Delete Case
            </button>
          </>
        )}
      </div>

      <div className="audit-trail">
        <h3>Audit Trail</h3>
        <ul>
          {selectedCase.auditTrail?.map((entry: any) => (
            <li key={entry.id}>
              {format(new Date(entry.timestamp), 'PPpp')} - {entry.action} by {entry.userId}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CaseDetails;