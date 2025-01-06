/**
 * Test suite for Dashboard component implementing FedRAMP High and CJIS compliance validation.
 * Verifies security features, audit logging, and real-time update capabilities.
 * @version 1.0.0
 */

import React from 'react'; // v18.0.0
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'; // v14.0.0
import { vi } from 'vitest'; // v0.34.0
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';
import Dashboard from './Dashboard';
import { AuditLogger } from '@company/audit-logger'; // v1.0.0

// Mock audit logger
const mockAuditLogger = {
  logAccess: vi.fn(),
  logSecurityEvent: vi.fn()
} as unknown as typeof AuditLogger;

vi.mock('@company/audit-logger', () => ({
  AuditLogger: {
    logAccess: mockAuditLogger.logAccess,
    logSecurityEvent: mockAuditLogger.logSecurityEvent
  }
}));

// Mock WebSocket for real-time updates
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn()
};

vi.mock('WebSocket', () => ({
  WebSocket: vi.fn(() => mockWebSocket)
}));

describe('Dashboard Component Security Tests', () => {
  // Set up secure test environment
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  // Clean up after tests
  afterAll(() => {
    server.close();
  });

  // Reset handlers and mocks before each test
  beforeEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  it('verifies security classification banner display and content', async () => {
    const { container } = renderWithProviders(<Dashboard />, {
      preloadedState: {
        auth: {
          securityLevel: 'FEDRAMP_HIGH'
        }
      }
    });

    // Verify classification banner presence
    const banner = screen.getByText(/FEDRAMP HIGH.*CJIS COMPLIANT/i);
    expect(banner).toBeInTheDocument();

    // Verify banner styling for visibility
    const bannerElement = container.querySelector('[class*="ClassificationBanner"]');
    expect(bannerElement).toHaveStyle({
      backgroundColor: expect.any(String),
      position: 'sticky',
      top: 0,
      zIndex: 1100
    });
  });

  it('validates secure session handling and timeout', async () => {
    const { container } = renderWithProviders(<Dashboard />);

    // Trigger session timeout
    vi.advanceTimersByTime(15 * 60 * 1000); // 15 minutes

    await waitFor(() => {
      // Verify timeout warning display
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument();

      // Verify audit log generation
      expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith({
        action: 'SESSION_TIMEOUT',
        severity: 'HIGH',
        details: expect.any(Object)
      });
    });
  });

  it('implements secure case selection with audit logging', async () => {
    const { container } = renderWithProviders(<Dashboard />);

    // Wait for cases to load
    await waitFor(() => {
      expect(screen.queryByText(/loading cases/i)).not.toBeInTheDocument();
    });

    // Select a case
    const caseElement = screen.getByText(/Case #4872/i);
    fireEvent.click(caseElement);

    // Verify audit logging
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      action: 'VIEW_CASE',
      entityType: 'CASE',
      entityId: expect.any(String),
      details: { source: 'DASHBOARD' }
    });
  });

  it('handles secure WebSocket updates with encryption validation', async () => {
    const { container } = renderWithProviders(<Dashboard />);

    // Simulate secure WebSocket connection
    const wsConnection = new WebSocket('wss://api.crimeminer.gov');
    
    // Verify secure connection parameters
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('wss://'),
      expect.objectContaining({
        protocols: ['v1.fedramp.high']
      })
    );

    // Simulate encrypted update
    const encryptedUpdate = {
      type: 'CASE_UPDATE',
      data: 'encrypted_payload',
      signature: 'valid_signature'
    };

    // Trigger update
    wsConnection.onmessage({ data: JSON.stringify(encryptedUpdate) });

    // Verify update handling
    await waitFor(() => {
      expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith({
        action: 'REALTIME_UPDATE',
        details: expect.objectContaining({
          type: 'CASE_UPDATE'
        })
      });
    });
  });

  it('enforces CJIS compliance for data display', async () => {
    const { container } = renderWithProviders(<Dashboard />, {
      preloadedState: {
        auth: {
          securityLevel: 'CJIS'
        }
      }
    });

    // Verify CJIS compliance indicators
    const complianceIndicator = screen.getByText(/CJIS COMPLIANT/i);
    expect(complianceIndicator).toBeInTheDocument();

    // Verify secure data display
    const securityStatus = screen.getByText(/Security Level: CJIS/i);
    expect(securityStatus).toBeInTheDocument();

    // Verify audit logging of CJIS access
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      action: 'VIEW_DASHBOARD',
      entityType: 'DASHBOARD',
      entityId: 'MAIN',
      details: { securityLevel: 'CJIS' }
    });
  });

  it('validates security context before rendering sensitive data', async () => {
    const { container } = renderWithProviders(<Dashboard />);

    // Wait for security validation
    await waitFor(() => {
      expect(screen.queryByText(/security validation failed/i)).not.toBeInTheDocument();
    });

    // Verify secure content rendering
    const caseList = screen.getByRole('region', { name: /case management/i });
    expect(caseList).toBeInTheDocument();

    // Verify security metadata display
    const securityMetadata = screen.getByText(/Last Validated:/i);
    expect(securityMetadata).toBeInTheDocument();
  });

  it('prevents unauthorized screen capture', async () => {
    const { container } = renderWithProviders(<Dashboard />);

    // Simulate print attempt
    const preventDefaultMock = vi.fn();
    const printEvent = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      preventDefault: preventDefaultMock
    });

    document.dispatchEvent(printEvent);

    // Verify prevention
    expect(preventDefaultMock).toHaveBeenCalled();

    // Verify security event logging
    expect(mockAuditLogger.logSecurityEvent).toHaveBeenCalledWith({
      action: 'SCREEN_CAPTURE_PREVENTED',
      severity: 'MEDIUM',
      details: expect.any(Object)
    });
  });

  it('maintains secure session state with audit trail', async () => {
    const { container, rerender } = renderWithProviders(<Dashboard />);

    // Verify initial session logging
    expect(mockAuditLogger.logAccess).toHaveBeenCalledWith({
      action: 'VIEW_DASHBOARD',
      entityType: 'DASHBOARD',
      entityId: 'MAIN',
      details: expect.any(Object)
    });

    // Simulate user activity
    fireEvent.click(screen.getByText(/Case Management Dashboard/i));

    // Verify session maintenance
    await waitFor(() => {
      const sessionInfo = screen.getByText(/Session ID:/i);
      expect(sessionInfo).toBeInTheDocument();
    });
  });
});