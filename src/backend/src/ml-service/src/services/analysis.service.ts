/**
 * @file Analysis service implementation for CrimeMiner ML service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant ML analysis pipeline
 */

import { injectable, inject } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from 'winston';
import { BaseError, ValidationError, ProcessError } from '@common/errors';
import {
  IAnalysisRequest,
  IAnalysisResult,
  EvidenceMediaType,
  AnalysisType,
  AnalysisContent,
  AnalysisStatus,
  IProcessMetrics
} from '../interfaces/analysis.interface';
import { AnalysisModel } from '../models/analysis.model';

// CJIS-compliant processor paths with security validation
const PROCESSOR_PATHS = {
  [EvidenceMediaType.AUDIO]: '../processors/audio.processor.py',
  [EvidenceMediaType.VIDEO]: '../processors/video.processor.py',
  [EvidenceMediaType.TEXT]: '../processors/text.processor.py',
  [EvidenceMediaType.IMAGE]: '../processors/image.processor.py'
} as const;

// FedRAMP-compliant security controls and resource limits
const SECURITY_CONTROLS = {
  MAX_RETRIES: 3,
  PROCESS_TIMEOUT: 3600000, // 1 hour
  RESOURCE_LIMITS: {
    CPU_SHARES: '4096',
    MEMORY_MB: '8192',
    FILE_DESCRIPTORS: '1024'
  },
  SANITIZE_TIMEOUT: 5000,
  CLEANUP_INTERVAL: 60000
};

@injectable()
export class AnalysisService {
  private readonly logger: Logger;
  private readonly activeProcesses: Map<string, ChildProcess>;
  private readonly processMetrics: Map<string, IProcessMetrics>;

  constructor() {
    this.logger = new Logger({
      level: 'info',
      format: Logger.format.json(),
      defaultMeta: { service: 'analysis-service' }
    });
    this.activeProcesses = new Map();
    this.processMetrics = new Map();

    // Setup process cleanup interval
    setInterval(() => this.cleanupStaleProcesses(), SECURITY_CONTROLS.CLEANUP_INTERVAL);
  }

  /**
   * Process evidence with requested analysis types ensuring CJIS compliance
   * @param request Analysis request with evidence details
   * @returns Promise resolving to analysis results
   */
  async analyzeEvidence(request: IAnalysisRequest): Promise<IAnalysisResult[]> {
    try {
      // Validate request
      this.validateAnalysisRequest(request);

      // Check resource availability
      await this.checkResourceAvailability(request.evidenceId);

      // Get processor path
      const processorPath = PROCESSOR_PATHS[request.mediaType];
      if (!processorPath) {
        throw new ValidationError(`Unsupported media type: ${request.mediaType}`);
      }

      // Initialize process metrics
      const metrics: IProcessMetrics = {
        startTime: new Date(),
        cpuUsage: 0,
        memoryUsage: 0,
        status: AnalysisStatus.PROCESSING
      };
      this.processMetrics.set(request.evidenceId, metrics);

      // Spawn processor with security controls
      const process = spawn('python3', [processorPath], {
        env: {
          ...process.env,
          EVIDENCE_ID: request.evidenceId,
          ANALYSIS_TYPES: JSON.stringify(request.analysisTypes),
          CPU_SHARES: SECURITY_CONTROLS.RESOURCE_LIMITS.CPU_SHARES,
          MEMORY_LIMIT: SECURITY_CONTROLS.RESOURCE_LIMITS.MEMORY_MB,
          MAX_FD: SECURITY_CONTROLS.RESOURCE_LIMITS.FILE_DESCRIPTORS
        }
      });

      // Track active process
      this.activeProcesses.set(request.evidenceId, process);

      // Process output handling with security validation
      const results: IAnalysisResult[] = [];
      let error: Error | null = null;

      process.stdout.on('data', (data) => {
        try {
          const result = JSON.parse(data.toString());
          if (this.validateAnalysisResult(result)) {
            results.push(result);
          }
        } catch (err) {
          this.logger.error('Error parsing processor output', { error: err, evidenceId: request.evidenceId });
        }
      });

      process.stderr.on('data', (data) => {
        this.logger.error('Processor error', { error: data.toString(), evidenceId: request.evidenceId });
        error = new ProcessError(data.toString());
      });

      // Wait for process completion with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.killProcess(request.evidenceId);
          reject(new ProcessError('Analysis timeout exceeded'));
        }, SECURITY_CONTROLS.PROCESS_TIMEOUT);

        process.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0 && !error) {
            resolve(true);
          } else {
            reject(error || new ProcessError(`Process exited with code ${code}`));
          }
        });
      });

      // Update metrics
      metrics.endTime = new Date();
      metrics.status = AnalysisStatus.COMPLETED;
      this.processMetrics.set(request.evidenceId, metrics);

      // Save results with audit trail
      await Promise.all(results.map(result => 
        AnalysisModel.saveWithAudit(result)
      ));

      return results;

    } catch (error) {
      this.logger.error('Analysis failed', { error, evidenceId: request.evidenceId });
      await this.handleAnalysisError(request.evidenceId, error);
      throw error;
    } finally {
      // Cleanup resources
      this.cleanupProcess(request.evidenceId);
    }
  }

  /**
   * Retrieve analysis results with security validation
   * @param evidenceId Evidence ID to retrieve results for
   * @returns Promise resolving to analysis results
   */
  async getAnalysisResults(evidenceId: string): Promise<IAnalysisResult[]> {
    try {
      const results = await AnalysisModel.findByEvidenceId(evidenceId);
      return results.map(result => this.sanitizeResult(result));
    } catch (error) {
      this.logger.error('Error retrieving analysis results', { error, evidenceId });
      throw error;
    }
  }

  /**
   * Cancel ongoing analysis process
   * @param evidenceId Evidence ID to cancel analysis for
   */
  async cancelAnalysis(evidenceId: string): Promise<void> {
    try {
      await this.killProcess(evidenceId);
      await this.cleanupProcess(evidenceId);
    } catch (error) {
      this.logger.error('Error canceling analysis', { error, evidenceId });
      throw error;
    }
  }

  /**
   * Validate analysis request parameters
   */
  private validateAnalysisRequest(request: IAnalysisRequest): void {
    if (!request.evidenceId) {
      throw new ValidationError('Evidence ID is required');
    }
    if (!request.mediaType || !Object.values(EvidenceMediaType).includes(request.mediaType)) {
      throw new ValidationError('Invalid media type');
    }
    if (!request.analysisTypes?.length) {
      throw new ValidationError('At least one analysis type is required');
    }
  }

  /**
   * Validate analysis result structure and content
   */
  private validateAnalysisResult(result: any): result is IAnalysisResult {
    return (
      result &&
      typeof result.evidenceId === 'string' &&
      Object.values(AnalysisType).includes(result.resultType) &&
      typeof result.confidence === 'number' &&
      result.confidence >= 0 &&
      result.confidence <= 1
    );
  }

  /**
   * Sanitize result data for security compliance
   */
  private sanitizeResult(result: IAnalysisResult): IAnalysisResult {
    const sanitized = { ...result };
    delete sanitized.error?.details;
    return sanitized;
  }

  /**
   * Kill process and cleanup resources
   */
  private async killProcess(evidenceId: string): Promise<void> {
    const process = this.activeProcesses.get(evidenceId);
    if (process) {
      process.kill('SIGTERM');
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, SECURITY_CONTROLS.SANITIZE_TIMEOUT));
      if (process.killed) {
        process.kill('SIGKILL');
      }
    }
  }

  /**
   * Cleanup process resources and metrics
   */
  private cleanupProcess(evidenceId: string): void {
    this.activeProcesses.delete(evidenceId);
    this.processMetrics.delete(evidenceId);
  }

  /**
   * Check resource availability before starting analysis
   */
  private async checkResourceAvailability(evidenceId: string): Promise<void> {
    const activeCount = this.activeProcesses.size;
    if (activeCount >= 100) { // Configurable limit
      throw new ProcessError('Maximum concurrent process limit reached');
    }
  }

  /**
   * Cleanup stale processes
   */
  private cleanupStaleProcesses(): void {
    const now = Date.now();
    for (const [evidenceId, metrics] of this.processMetrics.entries()) {
      if (metrics.startTime && (now - metrics.startTime.getTime() > SECURITY_CONTROLS.PROCESS_TIMEOUT)) {
        this.logger.warn('Cleaning up stale process', { evidenceId });
        this.killProcess(evidenceId).catch(error => {
          this.logger.error('Error cleaning up stale process', { error, evidenceId });
        });
      }
    }
  }

  /**
   * Handle analysis errors with proper logging and cleanup
   */
  private async handleAnalysisError(evidenceId: string, error: Error): Promise<void> {
    const metrics = this.processMetrics.get(evidenceId);
    if (metrics) {
      metrics.status = AnalysisStatus.FAILED;
      metrics.error = error.message;
      this.processMetrics.set(evidenceId, metrics);
    }
    await this.killProcess(evidenceId);
  }
}