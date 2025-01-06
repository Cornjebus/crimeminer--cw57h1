import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { rest } from 'msw';
import { mediaQuery } from '@testing-library/react-responsive';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';
import Cases from './Cases';

// Mock security context
const mockSecurityContext = {
  userId: 'test-user-123',
  securityLevel: 'FEDRAMP_HIGH',
  permissions: ['VIEW_CASES', 'EDIT_CASES', 'DELETE_CASES']
};

// Mock case data with security classifications
const mockSecureCase = {
  id: 'case-123',
  title: 'Test Case',
  description: 'Test case description',
  status: 'ACTIVE',
  securityLevel: 'FEDRAMP_HIGH',
  metadata: {
    evidenceCount: 5,
    teamMembers: [
      { id: 'user-1', name: 'John Doe' }
    ]
  },
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T11:00:00Z',
  classificationLevel: 'CONFIDENTIAL',
  auditTrail: [
    {
      id: 'audit-1',
      timestamp: '2024-01-15T10:00:00Z',
      action: 'CASE_CREATE',
      userId: 'test-user-123'
    }
  ]
};

// Mock audit log entries
const mockAuditLog = {
  action: 'VIEW_CASE',
  entityType: 'CASE',
  entityId: 'case-123',
  userId: 'test-user-123',
  timestamp: new Date().toISOString(),
  details: { source: 'CASE_LIST' }
};

// Mock WebSocket for real-time updates
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn()
};

describe('Cases Page Security and Functionality', () => {
  beforeAll(() => {
    // Initialize test environment with security context
    server.listen();
    global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket);
  });

  beforeEach(() => {
    // Reset handlers and security context
    server.resetHandlers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    // Clean up after each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Clean up test environment
    server.close();
    jest.restoreAllMocks();
  });

  it('renders case list with proper security classifications', async () => {
    // Mock API response with security headers
    server.use(
      rest.get('/api/v1/cases', (req, res, ctx) => {
        // Verify security headers
        expect(req.headers.get('X-Security-Level')).toBe('FEDRAMP_HIGH');
        expect(req.headers.get('X-Audit-User-ID')).toBe('test-user-123');

        return res(
          ctx.set('X-Content-Security-Policy', 'default-src "self"'),
          ctx.json({
            cases: [mockSecureCase],
            total: 1,
            page: 1,
            limit: 10
          })
        );
      })
    );

    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    // Verify case list renders with security elements
    await waitFor(() => {
      expect(screen.getByText('Test Case')).toBeInTheDocument();
      expect(screen.getByText('CONFIDENTIAL')).toBeInTheDocument();
      expect(screen.getByText('FEDRAMP_HIGH - FOR OFFICIAL USE ONLY')).toBeInTheDocument();
    });
  });

  it('handles secure case selection with audit logging', async () => {
    // Mock API responses
    server.use(
      rest.get('/api/v1/cases/:id', (req, res, ctx) => {
        return res(ctx.json({ case: mockSecureCase }));
      }),
      rest.post('/api/v1/audit/logs', (req, res, ctx) => {
        expect(req.body).toMatchObject(mockAuditLog);
        return res(ctx.json({ success: true }));
      })
    );

    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    // Select case and verify audit logging
    const caseElement = await screen.findByText('Test Case');
    fireEvent.click(caseElement);

    await waitFor(() => {
      expect(screen.getByTestId('case-details')).toBeInTheDocument();
      expect(screen.getByText('Classification: CONFIDENTIAL')).toBeInTheDocument();
    });
  });

  it('maintains responsive layout with security elements', async () => {
    // Test mobile layout
    mediaQuery.mockReturnValue({ matches: true });
    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    await waitFor(() => {
      const mobileLayout = screen.getByTestId('case-list');
      expect(mobileLayout).toHaveStyle({ width: '100%' });
      expect(screen.getByText('FEDRAMP_HIGH - FOR OFFICIAL USE ONLY')).toBeInTheDocument();
    });

    // Test desktop layout
    mediaQuery.mockReturnValue({ matches: false });
    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    await waitFor(() => {
      const desktopLayout = screen.getByTestId('case-list');
      expect(desktopLayout).toHaveStyle({ width: '50%' });
      expect(screen.getByText('FEDRAMP_HIGH - FOR OFFICIAL USE ONLY')).toBeInTheDocument();
    });
  });

  it('handles secure WebSocket updates', async () => {
    // Mock WebSocket messages
    const mockUpdate = {
      type: 'CASE_UPDATE',
      caseId: 'case-123',
      changes: { status: 'UPDATED' }
    };

    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    await waitFor(() => {
      // Verify WebSocket connection with security headers
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('/cases/updates'),
        expect.objectContaining({
          headers: {
            'Authorization': expect.any(String),
            'X-Security-Level': 'FEDRAMP_HIGH'
          }
        })
      );
    });

    // Simulate secure WebSocket message
    const messageEvent = new MessageEvent('message', {
      data: JSON.stringify(mockUpdate)
    });
    mockWebSocket.onmessage?.(messageEvent);

    await waitFor(() => {
      expect(screen.getByText('UPDATED')).toBeInTheDocument();
    });
  });

  it('enforces security clearance requirements', async () => {
    // Mock insufficient security clearance
    const lowSecurityContext = {
      ...mockSecurityContext,
      securityLevel: 'FEDRAMP_LOW'
    };

    renderWithProviders(<Cases securityContext={lowSecurityContext} />);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText('Insufficient security clearance')).toBeInTheDocument();
    });
  });

  it('validates audit trail completeness', async () => {
    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    const caseElement = await screen.findByText('Test Case');
    fireEvent.click(caseElement);

    await waitFor(() => {
      const auditTrail = screen.getByText('Audit Trail');
      expect(within(auditTrail).getByText('CASE_CREATE')).toBeInTheDocument();
      expect(within(auditTrail).getByText('test-user-123')).toBeInTheDocument();
    });
  });

  it('handles secure case updates', async () => {
    server.use(
      rest.put('/api/v1/cases/:id', (req, res, ctx) => {
        // Verify security headers and audit data
        expect(req.headers.get('X-Security-Level')).toBe('FEDRAMP_HIGH');
        expect(req.headers.get('X-Audit-User-ID')).toBe('test-user-123');
        
        return res(ctx.json({ 
          case: { ...mockSecureCase, ...req.body }
        }));
      })
    );

    renderWithProviders(<Cases securityContext={mockSecurityContext} />);

    // Update case and verify security
    const editButton = await screen.findByText('Edit Case');
    fireEvent.click(editButton);

    const titleInput = screen.getByLabelText('Case title');
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Updated Title')).toBeInTheDocument();
      expect(screen.getByText(/Audit Trail/)).toBeInTheDocument();
    });
  });
});