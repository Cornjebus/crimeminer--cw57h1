import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityProvider } from '@security/context';
import { AuditLogger } from '@security/audit-logger';
import { EntityList } from './EntityList';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Mock audit logger
const mockAuditLogger = {
  logAccess: vi.fn().mockResolvedValue(undefined)
} as unknown as AuditLogger;

// Mock secure test data
const createSecureMockEntities = (securityLevel: string) => [
  {
    type: 'PERSON',
    value: 'John Doe',
    confidence: 0.95,
    metadata: { source: 'facial_recognition' },
    securityContext: {
      userId: 'test-user',
      roles: ['ENTITY_READ'],
      clearanceLevel: securityLevel,
      auditToken: 'test-token'
    },
    accessLevel: 'READ',
    auditInfo: {
      lastAccessed: new Date().toISOString(),
      accessCount: 1
    }
  },
  {
    type: 'LOCATION',
    value: '123 Main St',
    confidence: 0.88,
    metadata: { source: 'text_analysis' },
    securityContext: {
      userId: 'test-user',
      roles: ['ENTITY_READ'],
      clearanceLevel: securityLevel,
      auditToken: 'test-token'
    },
    accessLevel: 'READ',
    auditInfo: {
      lastAccessed: new Date().toISOString(),
      accessCount: 1
    }
  }
];

// Security context setup
const securityContext = {
  userId: 'test-user',
  roles: ['ENTITY_READ', 'ENTITY_WRITE'],
  clearanceLevel: 'SECRET',
  auditToken: 'test-token'
};

describe('EntityList Component Security and Compliance', () => {
  beforeEach(() => {
    // Reset audit log mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up security context
    vi.resetAllMocks();
  });

  it('renders with proper security context', async () => {
    const onEntitySelect = vi.fn();
    
    renderWithProviders(
      <SecurityProvider context={securityContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={securityContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Verify security headers are present
    const entityList = screen.getByRole('list');
    expect(entityList).toHaveAttribute('data-security-level', 'SECRET');
    expect(entityList).toHaveAttribute('data-compliance', 'FEDRAMP_HIGH');
  });

  it('handles secure entity data correctly', async () => {
    const onEntitySelect = vi.fn();
    const mockEntities = createSecureMockEntities('SECRET');

    renderWithProviders(
      <SecurityProvider context={securityContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={securityContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Verify entities are rendered with security classifications
    await waitFor(() => {
      mockEntities.forEach(entity => {
        const entityElement = screen.getByText(entity.value);
        expect(entityElement).toHaveAttribute('data-classification', entity.securityContext.clearanceLevel);
      });
    });

    // Verify audit log entry for data access
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      action: 'FETCH_ENTITIES',
      userId: securityContext.userId,
      entityId: 'test-evidence-123',
      accessType: 'READ'
    });
  });

  it('enforces access control on filtering', async () => {
    const onEntitySelect = vi.fn();
    const restrictedContext = {
      ...securityContext,
      roles: ['ENTITY_READ'],
      clearanceLevel: 'CONFIDENTIAL'
    };

    renderWithProviders(
      <SecurityProvider context={restrictedContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={restrictedContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Attempt to filter classified entities
    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'PERSON' } });

    // Verify filtered results respect security clearance
    await waitFor(() => {
      const entities = screen.queryAllByRole('listitem');
      entities.forEach(entity => {
        const classification = entity.getAttribute('data-classification');
        expect(['UNCLASSIFIED', 'CONFIDENTIAL']).toContain(classification);
      });
    });
  });

  it('maintains audit trail during interactions', async () => {
    const onEntitySelect = vi.fn();
    const mockEntities = createSecureMockEntities('SECRET');

    renderWithProviders(
      <SecurityProvider context={securityContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={securityContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Select an entity
    const entityButton = await screen.findByText(mockEntities[0].value);
    fireEvent.click(entityButton);

    // Verify audit log entries
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      action: 'SELECT_ENTITY',
      userId: securityContext.userId,
      entityId: mockEntities[0].value,
      accessType: 'READ'
    });
  });

  it('handles security violations appropriately', async () => {
    const onEntitySelect = vi.fn();
    const restrictedContext = {
      ...securityContext,
      roles: [],
      clearanceLevel: 'CONFIDENTIAL'
    };

    renderWithProviders(
      <SecurityProvider context={restrictedContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={restrictedContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Attempt unauthorized access
    await waitFor(() => {
      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent('Error fetching entities: Invalid security context');
    });

    // Verify security violation is logged
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      action: 'FETCH_ENTITIES',
      userId: restrictedContext.userId,
      entityId: 'test-evidence-123',
      accessType: 'READ'
    });
  });

  it('validates chain of custody for entity interactions', async () => {
    const onEntitySelect = vi.fn();
    const mockEntities = createSecureMockEntities('SECRET');

    renderWithProviders(
      <SecurityProvider context={securityContext}>
        <EntityList
          evidenceId="test-evidence-123"
          onEntitySelect={onEntitySelect}
          securityContext={securityContext}
          accessLevel="READ"
          auditLogger={mockAuditLogger}
        />
      </SecurityProvider>
    );

    // Interact with entity
    const entityButton = await screen.findByText(mockEntities[0].value);
    fireEvent.click(entityButton);

    // Verify chain of custody attributes
    expect(entityButton).toHaveAttribute('data-chain-of-custody');
    expect(entityButton.getAttribute('data-chain-of-custody')).toMatch(
      new RegExp(`${securityContext.userId}.*${new Date().toISOString().split('T')[0]}`)
    );
  });
});