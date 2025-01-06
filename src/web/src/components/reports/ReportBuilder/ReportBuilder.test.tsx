import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { axe } from '@axe-core/react';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { ReportBuilder } from './ReportBuilder';
import { reportApi } from '../../../services/api/report.api';

// Mock API functions
vi.mock('../../../services/api/report.api', () => ({
  reportApi: {
    generateReport: vi.fn(),
    getReportTemplates: vi.fn(),
    saveReportTemplate: vi.fn(),
    validateCompliance: vi.fn(),
    logAuditEvent: vi.fn()
  }
}));

describe('ReportBuilder Component', () => {
  const defaultProps = {
    caseId: 'case-123',
    onComplete: vi.fn(),
    securityLevel: 'TOP_SECRET' as const,
    complianceLevel: 'FEDRAMP_HIGH' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful template fetch
    (reportApi.getReportTemplates as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'template-1',
          name: 'Investigation Template',
          sections: ['Case Overview', 'Evidence Summary']
        }
      ]
    });
  });

  describe('Security and Compliance', () => {
    it('validates FedRAMP High compliance requirements', async () => {
      const mockValidateCompliance = vi.fn().mockResolvedValue({
        compliant: true,
        validations: {
          fedRAMP: 'high',
          cjis: 'compliant'
        }
      });
      (reportApi.validateCompliance as jest.Mock).mockImplementation(mockValidateCompliance);

      renderWithProviders(<ReportBuilder {...defaultProps} />);

      // Fill form with classified data
      fireEvent.change(screen.getByRole('combobox', { name: /report type/i }), {
        target: { value: 'Investigation Summary' }
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /generate report/i }));

      await waitFor(() => {
        expect(mockValidateCompliance).toHaveBeenCalledWith({
          securityLevel: 'TOP_SECRET',
          complianceLevel: 'FEDRAMP_HIGH'
        });
      });
    });

    it('enforces CJIS security requirements', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      // Verify security classification field
      expect(screen.getByLabelText(/security classification/i)).toBeInTheDocument();

      // Verify digital signature option
      expect(screen.getByLabelText(/digital signature/i)).toBeInTheDocument();

      // Verify watermark field
      expect(screen.getByLabelText(/watermark/i)).toBeInTheDocument();
    });

    it('maintains chain of custody for report generation', async () => {
      const mockAuditLog = vi.fn();
      (reportApi.logAuditEvent as jest.Mock).mockImplementation(mockAuditLog);

      renderWithProviders(<ReportBuilder {...defaultProps} />);

      // Generate report
      fireEvent.click(screen.getByRole('button', { name: /generate report/i }));

      await waitFor(() => {
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
          action: 'REPORT_GENERATION',
          caseId: 'case-123',
          securityLevel: 'TOP_SECRET'
        }));
      });
    });
  });

  describe('Form Functionality', () => {
    it('handles report type selection', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      const typeSelect = screen.getByRole('combobox', { name: /report type/i });
      fireEvent.change(typeSelect, { target: { value: 'Investigation Summary' } });

      expect(typeSelect).toHaveValue('Investigation Summary');
    });

    it('handles section selection', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      const caseOverviewCheckbox = screen.getByRole('checkbox', { name: /case overview/i });
      fireEvent.click(caseOverviewCheckbox);

      expect(caseOverviewCheckbox).toBeChecked();
    });

    it('handles date range selection', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      const startDate = screen.getByLabelText(/start date/i);
      const endDate = screen.getByLabelText(/end date/i);

      fireEvent.change(startDate, { target: { value: '2024-01-01' } });
      fireEvent.change(endDate, { target: { value: '2024-01-31' } });

      expect(startDate).toHaveValue('2024-01-01');
      expect(endDate).toHaveValue('2024-01-31');
    });

    it('handles format selection', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      const pdfFormat = screen.getByRole('radio', { name: /pdf format/i });
      fireEvent.click(pdfFormat);

      expect(pdfFormat).toBeChecked();
    });
  });

  describe('Template Management', () => {
    it('loads available templates', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      await waitFor(() => {
        expect(reportApi.getReportTemplates).toHaveBeenCalledWith(
          'case-123',
          'TOP_SECRET'
        );
      });
    });

    it('saves report template with security metadata', async () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      // Fill form
      fireEvent.change(screen.getByRole('combobox', { name: /report type/i }), {
        target: { value: 'Investigation Summary' }
      });

      // Save template
      fireEvent.click(screen.getByRole('button', { name: /save as template/i }));

      await waitFor(() => {
        expect(reportApi.saveReportTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            securityLevel: 'TOP_SECRET',
            complianceLevel: 'FEDRAMP_HIGH'
          })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG accessibility standards', async () => {
      const { container } = renderWithProviders(<ReportBuilder {...defaultProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports keyboard navigation', () => {
      renderWithProviders(<ReportBuilder {...defaultProps} />);

      const typeSelect = screen.getByRole('combobox', { name: /report type/i });
      typeSelect.focus();
      expect(typeSelect).toHaveFocus();

      fireEvent.keyDown(typeSelect, { key: 'Tab' });
      const firstCheckbox = screen.getByRole('checkbox', { name: /case overview/i });
      expect(firstCheckbox).toHaveFocus();
    });
  });

  describe('Error Handling', () => {
    it('displays error message on report generation failure', async () => {
      (reportApi.generateReport as jest.Mock).mockRejectedValue(
        new Error('Report generation failed')
      );

      renderWithProviders(<ReportBuilder {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /generate report/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Report generation failed');
      });
    });

    it('handles security validation failures', async () => {
      (reportApi.validateCompliance as jest.Mock).mockRejectedValue(
        new Error('Security compliance validation failed')
      );

      renderWithProviders(<ReportBuilder {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /generate report/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Security compliance validation failed'
        );
      });
    });
  });
});