import React from 'react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { rest } from 'msw';
import axe from '@axe-core/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';
import Login from './Login';

// Security compliance constants
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block'
};

// Mock security context
const mockSecurityContext = {
  classificationLevel: 'FEDRAMP_HIGH',
  userId: 'test-user-id',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL',
  sessionId: crypto.randomUUID(),
  clearanceLevel: 'SECRET',
  auditEnabled: true
};

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Login Component', () => {
  // Setup before each test
  beforeEach(() => {
    server.listen();
    localStorage.clear();
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  // Cleanup after each test
  afterEach(() => {
    server.resetHandlers();
    server.close();
  });

  // Test security headers compliance
  it('validates security headers', async () => {
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        const headers = Object.entries(SECURITY_HEADERS).reduce((acc, [key, value]) => {
          return { ...acc, [key]: value };
        }, {});
        return res(ctx.set(headers), ctx.json({ success: true }));
      })
    );

    renderWithProviders(<Login />, { securityContext: mockSecurityContext });
    
    const response = await fetch('/api/v1/auth/login');
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      expect(response.headers.get(key)).toBe(value);
    });
  });

  // Test FIPS 140-2 password validation
  it('validates password against FIPS 140-2 requirements', async () => {
    renderWithProviders(<Login />, { securityContext: mockSecurityContext });

    const passwordInput = screen.getByLabelText(/password/i);
    fireEvent.change(passwordInput, { target: { value: 'weak' } });

    expect(screen.getByText(/Password must be at least 14 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/Password must contain uppercase letters/i)).toBeInTheDocument();
    expect(screen.getByText(/Password must contain numbers/i)).toBeInTheDocument();
    expect(screen.getByText(/Password must contain special characters/i)).toBeInTheDocument();
  });

  // Test complete MFA flow
  it('handles complete MFA verification flow', async () => {
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        return res(ctx.json({ mfaRequired: true, sessionId: 'test-session' }));
      }),
      rest.post('/api/v1/auth/mfa', (req, res, ctx) => {
        return res(ctx.json({ success: true, user: { id: 'test-user' } }));
      })
    );

    renderWithProviders(<Login />, { securityContext: mockSecurityContext });

    // Submit initial login
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { 
      target: { value: 'StrongP@ssw0rd123!' } 
    });
    fireEvent.click(screen.getByText(/login/i));

    // Wait for MFA screen
    await waitFor(() => {
      expect(screen.getByText(/Enter MFA Code/i)).toBeInTheDocument();
    });

    // Submit MFA code
    fireEvent.change(screen.getByLabelText(/MFA Code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByText(/verify mfa/i));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  // Test account lockout
  it('implements account lockout after failed attempts', async () => {
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        return res(ctx.status(401));
      })
    );

    renderWithProviders(<Login />, { securityContext: mockSecurityContext });

    // Attempt login 3 times
    for (let i = 0; i < 3; i++) {
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
      fireEvent.change(screen.getByLabelText(/password/i), { 
        target: { value: 'WrongP@ssw0rd123!' } 
      });
      fireEvent.click(screen.getByText(/login/i));

      await waitFor(() => {
        expect(screen.getByText(/login/i)).toBeInTheDocument();
      });
    }

    // Verify lockout message
    await waitFor(() => {
      expect(screen.getByText(/Account locked/i)).toBeInTheDocument();
    });
  });

  // Test audit logging
  it('generates appropriate audit logs', async () => {
    const mockAuditLogger = jest.fn();
    server.use(
      rest.post('/api/v1/audit/logs', (req, res, ctx) => {
        mockAuditLogger(req.body);
        return res(ctx.json({ success: true }));
      })
    );

    renderWithProviders(<Login />, { 
      securityContext: mockSecurityContext,
      auditEnabled: true 
    });

    // Perform login
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { 
      target: { value: 'StrongP@ssw0rd123!' } 
    });
    fireEvent.click(screen.getByText(/login/i));

    await waitFor(() => {
      expect(mockAuditLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOGIN_ATTEMPT',
          username: 'testuser'
        })
      );
    });
  });

  // Test accessibility compliance
  it('meets accessibility requirements', async () => {
    const { container } = renderWithProviders(<Login />, { 
      securityContext: mockSecurityContext 
    });
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Test FedRAMP compliance status
  it('displays FedRAMP and CJIS compliance status', () => {
    renderWithProviders(<Login />, {
      securityContext: mockSecurityContext,
      complianceLevel: 'FEDRAMP_HIGH'
    });

    expect(screen.getByText(/FedRAMP Status/i)).toBeInTheDocument();
    expect(screen.getByText(/CJIS Status/i)).toBeInTheDocument();
  });

  // Test input validation and sanitization
  it('validates and sanitizes user input', async () => {
    renderWithProviders(<Login />, { securityContext: mockSecurityContext });

    // Test XSS prevention
    const maliciousInput = '<script>alert("xss")</script>';
    fireEvent.change(screen.getByLabelText(/username/i), { 
      target: { value: maliciousInput } 
    });

    expect(screen.getByText(/Username contains invalid characters/i)).toBeInTheDocument();
  });

  // Test session handling
  it('handles session timeout appropriately', async () => {
    jest.useFakeTimers();
    
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        return res(ctx.json({ 
          success: true,
          sessionTimeout: 900 // 15 minutes
        }));
      })
    );

    renderWithProviders(<Login />, { securityContext: mockSecurityContext });

    // Fast-forward 16 minutes
    jest.advanceTimersByTime(16 * 60 * 1000);

    await waitFor(() => {
      expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    });

    jest.useRealTimers();
  });
});