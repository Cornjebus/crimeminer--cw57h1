import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import Reports from './Reports';
import { reportApi } from '../../services/api/report.api';

// Mock API functions
vi.mock('../../services/api/report.api', () => ({
  reportApi: {
    downloadReport: vi.fn(),
    validateCompliance: vi.fn(),
    logAuditEvent: vi.fn()
  }
}));

// Helper function to render Reports component with security context
const renderReportsPage = (options = {}) => {
  const defaultOptions = {
    preloadedState: {},
    securityContext: {
      clearanceLevel: 'SECRET',
      complianceLevel: 'FEDRAMP_HIGH',
      userId: 'test-user',
      agencyId: 'test-agency'
    },
    route: '/cases/test-case-id/reports'
  };

  return renderWithProviders(
    <Reports />,
    { ...defaultOptions, ...options }
  );
};

describe('Reports Page Security and Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportApi.validateCompliance.mockResolvedValue({ isValid: true });
  });

  test('validates FedRAMP compliance headers', async () => {
    renderReportsPage();

    await waitFor(() => {
      expect(reportApi.validateCompliance).toHaveBeenCalledWith({
        operation: 'REPORT_ACCESS',
        standards: ['FEDRAMP_HIGH', 'CJIS']
      });
    });

    // Verify security classification display
    expect(screen.getByText(/Classification:/)).toBeInTheDocument();
  });

  test('enforces CJIS security controls', async () => {
    reportApi.validateCompliance.mockResolvedValue({ isValid: false });
    renderReportsPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /You do not have sufficient clearance/
      );
    });
  });

  test('logs audit events for report generation', async () => {
    renderReportsPage();

    const generateButton = screen.getByRole('button', { name: /Generate Report/i });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(reportApi.logAuditEvent).toHaveBeenCalledWith({
        action: 'REPORT_GENERATION',
        outcome: 'SUCCESS',
        details: expect.any(Object)
      });
    });
  });

  test('validates security clearance for downloads', async () => {
    renderReportsPage({
      securityContext: {
        clearanceLevel: 'CONFIDENTIAL',
        complianceLevel: 'FEDRAMP_HIGH'
      }
    });

    const downloadButton = screen.getByRole('button', { name: /Download Report/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Download failed: Insufficient permissions/
      );
    });
  });
});

describe('Reports Page Accessibility', () => {
  test('meets WCAG 2.1 AA requirements', async () => {
    const { container } = renderReportsPage();
    
    // Run axe accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('supports keyboard navigation', async () => {
    renderReportsPage();

    // Test tab navigation
    const reportTypeSelect = screen.getByRole('combobox', { name: /Report Type/i });
    const sectionCheckboxes = screen.getAllByRole('checkbox');
    const generateButton = screen.getByRole('button', { name: /Generate Report/i });

    fireEvent.tab();
    expect(reportTypeSelect).toHaveFocus();

    fireEvent.tab();
    expect(sectionCheckboxes[0]).toHaveFocus();

    // Navigate to generate button
    while (document.activeElement !== generateButton) {
      fireEvent.tab();
    }
    expect(generateButton).toHaveFocus();
  });

  test('provides appropriate ARIA labels', () => {
    renderReportsPage();

    expect(screen.getByRole('main', { name: /Report Generation/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Report Type/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Classification:/);
  });
});

describe('Report Generation Interface', () => {
  test('handles report type selection', async () => {
    renderReportsPage();

    const reportTypeSelect = screen.getByRole('combobox', { name: /Report Type/i });
    fireEvent.change(reportTypeSelect, { target: { value: 'Investigation Summary' } });

    expect(reportTypeSelect).toHaveValue('Investigation Summary');
  });

  test('validates required sections', async () => {
    renderReportsPage();

    const generateButton = screen.getByRole('button', { name: /Generate Report/i });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Please select at least one section/
      );
    });
  });

  test('handles date range selection', async () => {
    renderReportsPage();

    const startDate = screen.getByLabelText(/Start Date/i);
    const endDate = screen.getByLabelText(/End Date/i);

    fireEvent.change(startDate, { target: { value: '2024-01-01' } });
    fireEvent.change(endDate, { target: { value: '2024-01-31' } });

    expect(startDate).toHaveValue('2024-01-01');
    expect(endDate).toHaveValue('2024-01-31');
  });

  test('validates format selection', async () => {
    renderReportsPage();

    const pdfFormat = screen.getByLabelText(/PDF format/i);
    fireEvent.click(pdfFormat);

    expect(pdfFormat).toBeChecked();
  });
});

describe('Report Download Functionality', () => {
  test('initiates secure download', async () => {
    reportApi.downloadReport.mockResolvedValue(new Blob());
    renderReportsPage();

    const downloadButton = screen.getByRole('button', { name: /Download Report/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(reportApi.downloadReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          securityContext: expect.any(Object)
        })
      );
    });
  });

  test('handles download errors', async () => {
    reportApi.downloadReport.mockRejectedValue(new Error('Download failed'));
    renderReportsPage();

    const downloadButton = screen.getByRole('button', { name: /Download Report/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Download failed/);
    });
  });

  test('logs download audit trail', async () => {
    renderReportsPage();

    const downloadButton = screen.getByRole('button', { name: /Download Report/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(reportApi.logAuditEvent).toHaveBeenCalledWith({
        action: 'REPORT_DOWNLOADED',
        outcome: 'SUCCESS',
        details: expect.any(Object)
      });
    });
  });
});

describe('Error Handling', () => {
  test('displays validation errors', async () => {
    renderReportsPage();

    const generateButton = screen.getByRole('button', { name: /Generate Report/i });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  test('handles API errors gracefully', async () => {
    reportApi.validateCompliance.mockRejectedValue(new Error('API Error'));
    renderReportsPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/API Error/);
    });
  });

  test('provides error recovery options', async () => {
    reportApi.downloadReport.mockRejectedValue(new Error('Download failed'));
    renderReportsPage();

    const downloadButton = screen.getByRole('button', { name: /Download Report/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Download failed/);
      expect(within(alert).getByRole('button', { name: /Dismiss/i })).toBeInTheDocument();
    });
  });
});