import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { server } from '../../../tests/mocks/server';
import CaseList from './CaseList';
import { CaseStatus, SecurityClassification } from '../../../types/case.types';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock data with security classifications
const mockCases = [
  {
    id: '1',
    title: 'Drug Trafficking Investigation',
    status: CaseStatus.ACTIVE,
    securityLevel: SecurityClassification.SECRET,
    updatedAt: '2024-01-15T10:00:00Z',
    metadata: {
      classification: 'CJIS',
      priority: 1
    }
  },
  {
    id: '2',
    title: 'Fraud Investigation',
    status: CaseStatus.PENDING_REVIEW,
    securityLevel: SecurityClassification.CONFIDENTIAL,
    updatedAt: '2024-01-14T09:00:00Z',
    metadata: {
      classification: 'FEDRAMP_HIGH',
      priority: 2
    }
  }
];

// Mock pagination data
const mockPagination = {
  total: 20,
  limit: 10,
  page: 1
};

// Mock security context
const mockSecurityContext = {
  classificationLevel: 'FEDRAMP_HIGH',
  userId: 'test-user-id',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL',
  sessionId: crypto.randomUUID(),
  clearanceLevel: 'SECRET'
};

describe('CaseList Component', () => {
  beforeEach(() => {
    // Start MSW server with security headers
    server.listen();
    
    // Mock audit logging
    vi.mock('@company/audit-logger', () => ({
      useAudit: () => ({
        logAccess: vi.fn().mockResolvedValue(undefined)
      })
    }));
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  describe('Security Compliance', () => {
    it('should render with FedRAMP High security context', async () => {
      const { container } = renderWithProviders(
        <CaseList securityLevel="FEDRAMP_HIGH" />,
        { securityContext: mockSecurityContext }
      );

      // Verify security headers
      const headers = container.querySelector('[data-testid="case-list"]')?.getAttribute('data-security-level');
      expect(headers).toBe('FEDRAMP_HIGH');
    });

    it('should enforce CJIS compliance for sensitive cases', async () => {
      const { container } = renderWithProviders(
        <CaseList securityLevel="CJIS" />,
        { securityContext: { ...mockSecurityContext, classificationLevel: 'CJIS' } }
      );

      // Verify CJIS markers
      const cjisCase = screen.getByText('Drug Trafficking Investigation');
      expect(cjisCase).toHaveAttribute('data-classification', 'CJIS');
    });

    it('should generate audit logs for case access', async () => {
      const mockLogAccess = vi.fn();
      vi.mock('@company/audit-logger', () => ({
        useAudit: () => ({ logAccess: mockLogAccess })
      }));

      renderWithProviders(<CaseList />, { securityContext: mockSecurityContext });
      
      await waitFor(() => {
        expect(mockLogAccess).toHaveBeenCalledWith({
          action: 'CASE_LIST_INIT',
          entityType: 'CASE_LIST',
          entityId: 'ALL',
          details: { securityLevel: 'FEDRAMP_HIGH' }
        });
      });
    });
  });

  describe('Accessibility Compliance', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderWithProviders(<CaseList />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      renderWithProviders(<CaseList />);
      
      const caseRows = screen.getAllByRole('row');
      caseRows[1].focus();
      fireEvent.keyDown(caseRows[1], { key: 'Enter' });
      
      await waitFor(() => {
        expect(caseRows[1]).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should have proper ARIA labels', () => {
      renderWithProviders(<CaseList />);
      
      expect(screen.getByRole('table')).toHaveAttribute('aria-label', 'secure case list');
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'case list pagination');
    });
  });

  describe('Responsive Design', () => {
    it('should render mobile layout under 768px', () => {
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));
      
      renderWithProviders(<CaseList />);
      
      expect(screen.queryByText('Status')).not.toBeInTheDocument();
      expect(screen.queryByText('Security Level')).not.toBeInTheDocument();
    });

    it('should render tablet layout between 768px and 1024px', () => {
      global.innerWidth = 800;
      global.dispatchEvent(new Event('resize'));
      
      renderWithProviders(<CaseList />);
      
      const pagination = screen.getByRole('navigation');
      expect(pagination).toHaveAttribute('data-size', 'medium');
    });

    it('should render desktop layout above 1024px', () => {
      global.innerWidth = 1200;
      global.dispatchEvent(new Event('resize'));
      
      renderWithProviders(<CaseList />);
      
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Security Level')).toBeInTheDocument();
    });
  });

  describe('Case List Functionality', () => {
    it('should render cases with security classifications', async () => {
      renderWithProviders(<CaseList />, {
        preloadedState: {
          cases: {
            items: mockCases,
            pagination: mockPagination
          }
        }
      });

      mockCases.forEach(case_ => {
        const row = screen.getByText(case_.title).closest('tr');
        expect(row).toHaveAttribute('data-security-level', case_.securityLevel);
      });
    });

    it('should handle secure pagination', async () => {
      const mockHandlePageChange = vi.fn();
      
      renderWithProviders(
        <CaseList onCaseSelect={mockHandlePageChange} />,
        {
          preloadedState: {
            cases: {
              items: mockCases,
              pagination: mockPagination
            }
          }
        }
      );

      const pagination = screen.getByRole('navigation');
      const nextButton = within(pagination).getByRole('button', { name: /next/i });
      
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        expect(mockHandlePageChange).toHaveBeenCalledWith(2);
      });
    });

    it('should handle secure sorting', async () => {
      renderWithProviders(<CaseList />);
      
      const titleHeader = screen.getByText('Title');
      fireEvent.click(titleHeader);
      
      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        expect(rows[1]).toHaveTextContent('Drug Trafficking Investigation');
      });
    });

    it('should handle case selection with security validation', async () => {
      const mockHandleSelect = vi.fn();
      
      renderWithProviders(
        <CaseList onCaseSelect={mockHandleSelect} />,
        {
          preloadedState: {
            cases: {
              items: mockCases,
              pagination: mockPagination
            }
          }
        }
      );

      const caseRow = screen.getByText('Drug Trafficking Investigation').closest('tr');
      fireEvent.click(caseRow!);
      
      await waitFor(() => {
        expect(mockHandleSelect).toHaveBeenCalledWith('1');
      });
    });
  });
});