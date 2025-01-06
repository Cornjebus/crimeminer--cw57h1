import React, { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSecurityContext } from '@security/context';
import { Button } from '../../common/Button/Button';
import { Select } from '../../common/Select/Select';
import { reportApi } from '../../../services/api/report.api';
import styles from './ReportBuilder.scss';

interface ReportBuilderProps {
  caseId: string;
  onComplete: (reportId: string) => void;
  className?: string;
  securityLevel: 'TOP_SECRET' | 'SECRET' | 'CONFIDENTIAL' | 'UNCLASSIFIED';
  complianceLevel: 'FEDRAMP_HIGH' | 'CJIS' | 'STANDARD';
}

interface ReportFormData {
  type: 'Investigation Summary' | 'Evidence Analysis' | 'Timeline Report';
  sections: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  format: 'PDF' | 'Word' | 'HTML';
  templateId: string | null;
  classification: string;
  digitalSignature: boolean;
  watermark: string;
  auditMetadata: {
    requestedBy: string;
    purpose: string;
    classification: string;
  };
}

const REPORT_SECTIONS = [
  'Case Overview',
  'Evidence Summary',
  'Timeline of Events',
  'Entity Network Analysis',
  'Key Findings',
  'Media Transcripts',
  'Chain of Custody',
  'Digital Signatures'
];

const REPORT_TYPES = [
  'Investigation Summary',
  'Evidence Analysis',
  'Timeline Report'
];

const REPORT_FORMATS = ['PDF', 'Word', 'HTML'];

export const ReportBuilder: React.FC<ReportBuilderProps> = ({
  caseId,
  onComplete,
  className,
  securityLevel,
  complianceLevel
}) => {
  const { register, handleSubmit, watch, setValue } = useForm<ReportFormData>();
  const [templates, setTemplates] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { validateAccess, getCurrentUser } = useSecurityContext();

  const selectedType = watch('type');

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await reportApi.getReportTemplates(caseId, securityLevel);
        setTemplates(response.data);
      } catch (err) {
        setError('Failed to load report templates');
        console.error('Template loading error:', err);
      }
    };

    loadTemplates();
  }, [caseId, securityLevel]);

  const handleFormSubmit = useCallback(async (formData: ReportFormData) => {
    try {
      setIsGenerating(true);
      setError(null);

      // Validate security clearance
      const hasAccess = await validateAccess({
        operation: 'REPORT_GENERATION',
        securityLevel,
        resourceId: caseId
      });

      if (!hasAccess) {
        throw new Error('Insufficient security clearance for report generation');
      }

      const currentUser = getCurrentUser();
      
      const reportConfig = {
        caseId,
        type: formData.type,
        sections: formData.sections,
        dateRange: formData.dateRange,
        format: formData.format,
        templateId: formData.templateId,
        securityLevel,
        auditRequired: true,
        chainOfCustody: true,
        watermarkText: `${securityLevel} - ${currentUser.agency}`,
        retentionPeriod: 7 * 365, // 7 years retention
        digitalSignature: true,
        complianceLevel,
        auditMetadata: {
          ...formData.auditMetadata,
          generatedBy: currentUser.id,
          timestamp: new Date().toISOString()
        }
      };

      const response = await reportApi.generateReport(reportConfig);
      onComplete(response.data.id);

    } catch (err) {
      setError(err.message || 'Failed to generate report');
      console.error('Report generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [caseId, securityLevel, complianceLevel, onComplete, validateAccess, getCurrentUser]);

  const handleSaveTemplate = useCallback(async (templateName: string) => {
    try {
      const formValues = watch();
      const currentUser = getCurrentUser();

      const templateConfig = {
        name: templateName,
        config: {
          ...formValues,
          securityLevel,
          complianceLevel
        },
        createdBy: currentUser.id,
        version: '1.0.0',
        securityControls: [
          'FedRAMP_High',
          'CJIS_Compliance',
          'Digital_Signatures'
        ]
      };

      await reportApi.saveReportTemplate(templateConfig);
      
    } catch (err) {
      setError('Failed to save template');
      console.error('Template save error:', err);
    }
  }, [watch, securityLevel, complianceLevel, getCurrentUser]);

  return (
    <form 
      className={`${styles.reportBuilder} ${className || ''}`}
      onSubmit={handleSubmit(handleFormSubmit)}
      aria-label="Report Generation Form"
    >
      <div className={styles.reportType}>
        <Select
          name="type"
          options={REPORT_TYPES}
          value={selectedType}
          placeholder="Select Report Type"
          onChange={(value) => setValue('type', value as ReportFormData['type'])}
          ariaLabel="Report Type Selection"
        />
      </div>

      <div className={styles.sectionList}>
        {REPORT_SECTIONS.map((section) => (
          <div key={section} className={styles.sectionItem}>
            <input
              type="checkbox"
              id={`section-${section}`}
              {...register('sections')}
              value={section}
              aria-label={`Include ${section} section`}
            />
            <label htmlFor={`section-${section}`}>{section}</label>
          </div>
        ))}
      </div>

      <div className={styles.dateRange}>
        <input
          type="date"
          {...register('dateRange.start')}
          aria-label="Start Date"
        />
        <input
          type="date"
          {...register('dateRange.end')}
          aria-label="End Date"
        />
      </div>

      <div className={styles.formatOptions}>
        {REPORT_FORMATS.map((format) => (
          <div key={format} className={styles.formatOption}>
            <input
              type="radio"
              id={`format-${format}`}
              {...register('format')}
              value={format}
              aria-label={`${format} format`}
            />
            <label htmlFor={`format-${format}`}>{format}</label>
          </div>
        ))}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          disabled={isGenerating}
          ariaLabel="Generate Report"
        >
          {isGenerating ? 'Generating...' : 'Generate Report'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleSaveTemplate('New Template')}
          ariaLabel="Save as Template"
        >
          Save as Template
        </Button>
      </div>
    </form>
  );
};

export default ReportBuilder;