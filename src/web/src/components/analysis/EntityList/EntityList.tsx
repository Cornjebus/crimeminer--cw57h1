import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import classNames from 'classnames';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnalysisResult, AnalysisContent } from '../../../types/analysis.types';

// Security and compliance types
interface SecurityContext {
  userId: string;
  roles: string[];
  clearanceLevel: string;
  auditToken: string;
}

interface AuditContext {
  timestamp: number;
  action: string;
  userId: string;
  entityId: string;
  accessType: string;
}

interface AuditLogger {
  logAccess: (context: AuditContext) => Promise<void>;
}

type AccessLevel = 'READ' | 'WRITE' | 'ADMIN';

interface SecureEntity {
  type: string;
  value: string;
  confidence: number;
  metadata?: Record<string, any>;
  securityContext: SecurityContext;
  accessLevel: AccessLevel;
  auditInfo: {
    lastAccessed: string;
    accessCount: number;
  };
}

interface SecureEntityListProps {
  evidenceId: string;
  onEntitySelect: (entity: SecureEntity, auditContext: AuditContext) => void;
  className?: string;
  securityContext: SecurityContext;
  accessLevel: AccessLevel;
  auditLogger: AuditLogger;
}

// Security utility functions
const validateSecurityContext = (context: SecurityContext): boolean => {
  return !!(context?.userId && context?.roles && context?.clearanceLevel && context?.auditToken);
};

const checkAccessPermission = (
  entity: SecureEntity,
  context: SecurityContext,
  requiredLevel: AccessLevel
): boolean => {
  if (!validateSecurityContext(context)) return false;
  
  const hasRequiredClearance = entity.securityContext.clearanceLevel <= context.clearanceLevel;
  const hasRequiredAccess = context.roles.includes(`ENTITY_${requiredLevel}`);
  
  return hasRequiredClearance && hasRequiredAccess;
};

// Secure entity sorting function
const secureEntitySort = (
  entities: SecureEntity[],
  securityContext: SecurityContext
): SecureEntity[] => {
  if (!validateSecurityContext(securityContext)) return [];

  return [...entities]
    .filter(entity => checkAccessPermission(entity, securityContext, 'READ'))
    .sort((a, b) => b.confidence - a.confidence);
};

// Secure entity filtering function
const secureEntityFilter = (
  entities: SecureEntity[],
  type: string | null,
  securityContext: SecurityContext
): SecureEntity[] => {
  if (!validateSecurityContext(securityContext)) return [];

  return entities.filter(entity => 
    checkAccessPermission(entity, securityContext, 'READ') &&
    (!type || entity.type === type)
  );
};

export const SecureEntityList: React.FC<SecureEntityListProps> = ({
  evidenceId,
  onEntitySelect,
  className = '',
  securityContext,
  accessLevel = 'READ',
  auditLogger
}) => {
  // State management with security validation
  const [entities, setEntities] = useState<SecureEntity[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling for performance
  const rowVirtualizer = useVirtualizer({
    count: entities.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 50,
    overscan: 5
  });

  // Secure data fetching
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        if (!validateSecurityContext(securityContext)) {
          throw new Error('Invalid security context');
        }

        // Audit log for data access
        await auditLogger.logAccess({
          timestamp: Date.now(),
          action: 'FETCH_ENTITIES',
          userId: securityContext.userId,
          entityId: evidenceId,
          accessType: 'READ'
        });

        // Implement your secure data fetching logic here
        // This is a placeholder for the actual implementation
        const response = await fetch(`/api/secure/evidence/${evidenceId}/entities`, {
          headers: {
            'Authorization': `Bearer ${securityContext.auditToken}`,
            'X-Security-Context': JSON.stringify(securityContext)
          }
        });

        if (!response.ok) throw new Error('Failed to fetch entities');

        const data = await response.json();
        setEntities(data.entities);
      } catch (err) {
        setError('Error fetching entities: ' + err.message);
        console.error('Secure entity fetch error:', err);
      }
    };

    fetchEntities();
  }, [evidenceId, securityContext, auditLogger]);

  // Secure entity selection handler
  const handleEntitySelect = useCallback(async (entity: SecureEntity) => {
    try {
      if (!checkAccessPermission(entity, securityContext, accessLevel)) {
        throw new Error('Insufficient permissions');
      }

      const auditContext: AuditContext = {
        timestamp: Date.now(),
        action: 'SELECT_ENTITY',
        userId: securityContext.userId,
        entityId: entity.value,
        accessType: accessLevel
      };

      await auditLogger.logAccess(auditContext);
      onEntitySelect(entity, auditContext);
    } catch (err) {
      setError('Error selecting entity: ' + err.message);
      console.error('Secure entity selection error:', err);
    }
  }, [securityContext, accessLevel, auditLogger, onEntitySelect]);

  // Secure filtered and sorted entities
  const secureFilteredEntities = useMemo(() => {
    return secureEntityFilter(
      secureEntitySort(entities, securityContext),
      selectedType,
      securityContext
    );
  }, [entities, selectedType, securityContext]);

  // Render with security controls and accessibility
  return (
    <div 
      ref={containerRef}
      className={classNames('secure-entity-list', className)}
      aria-label="Entity List"
      role="list"
    >
      {error && (
        <div className="secure-entity-list__error" role="alert">
          {error}
        </div>
      )}
      
      <div className="secure-entity-list__type-filter">
        <select
          aria-label="Filter entities by type"
          onChange={(e) => setSelectedType(e.target.value || null)}
          value={selectedType || ''}
        >
          <option value="">All Types</option>
          {Array.from(new Set(entities.map(e => e.type))).map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div 
        className="secure-entity-list__items"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const entity = secureFilteredEntities[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              className="secure-entity-list__item"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
              role="listitem"
            >
              <button
                className="secure-entity-list__item-button"
                onClick={() => handleEntitySelect(entity)}
                disabled={!checkAccessPermission(entity, securityContext, accessLevel)}
                aria-label={`${entity.type}: ${entity.value} (Confidence: ${Math.round(entity.confidence * 100)}%)`}
              >
                <span className="secure-entity-list__item-type">
                  {entity.type}
                </span>
                <span className="secure-entity-list__item-value">
                  {entity.value}
                </span>
                <span className="secure-entity-list__item-confidence">
                  {Math.round(entity.confidence * 100)}%
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SecureEntityList;