/**
 * @file Analysis model implementation for CrimeMiner ML service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant database model for ML analysis results
 */

import { Schema, model, index, Document } from 'mongoose'; // v7.0.0
import { Field, ObjectType } from 'type-graphql'; // v1.1.1
import { IBaseEntity } from '../../../common/interfaces/base.interface';
import { 
  IAnalysisResult, 
  AnalysisType, 
  AnalysisContent, 
  AnalysisStatus 
} from '../interfaces/analysis.interface';

/**
 * Interface for pagination options
 */
interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface for aggregated results
 */
interface AggregatedResults {
  totalCount: number;
  averageConfidence: number;
  confidenceDistribution: Record<string, number>;
  processingTimeStats: {
    min: number;
    max: number;
    avg: number;
  };
}

/**
 * Schema definition for analysis results with comprehensive indexing
 */
const analysisSchema = new Schema<IAnalysisResult>({
  evidenceId: {
    type: String,
    required: true,
    index: true
  },
  resultType: {
    type: String,
    enum: Object.values(AnalysisType),
    required: true,
    index: true
  },
  content: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: (content: AnalysisContent) => {
        // Validate content structure based on resultType
        return true; // Implement detailed validation
      }
    }
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    index: true
  },
  processingTime: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: Object.values(AnalysisStatus),
    required: true,
    default: AnalysisStatus.PENDING,
    index: true
  },
  error: {
    code: String,
    message: String,
    details: Schema.Types.Mixed,
    timestamp: Date
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  version: {
    type: Number,
    required: true,
    default: 1
  }
}, {
  timestamps: true,
  versionKey: 'version'
});

// Compound indexes for optimized queries
analysisSchema.index({ evidenceId: 1, resultType: 1 });
analysisSchema.index({ status: 1, createdAt: -1 });
analysisSchema.index({ confidence: -1, resultType: 1 });

@ObjectType()
export class AnalysisModel extends model<IAnalysisResult>('Analysis', analysisSchema) {
  /**
   * Find all analysis results for a given evidence ID
   * @param evidenceId - The evidence ID to search for
   * @returns Promise resolving to array of analysis results
   */
  static async findByEvidenceId(evidenceId: string): Promise<IAnalysisResult[]> {
    return this.find({ 
      evidenceId,
      status: AnalysisStatus.COMPLETED 
    }).sort({ createdAt: -1 });
  }

  /**
   * Find analysis results by type with pagination
   * @param resultType - The type of analysis results to find
   * @param options - Pagination options
   * @returns Promise resolving to paginated results
   */
  static async findByType(
    resultType: AnalysisType,
    options: PaginationOptions
  ): Promise<{ results: IAnalysisResult[]; total: number }> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      this.find({ resultType, status: AnalysisStatus.COMPLETED })
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limit),
      this.countDocuments({ resultType, status: AnalysisStatus.COMPLETED })
    ]);

    return { results, total };
  }

  /**
   * Aggregate analysis results by confidence threshold
   * @param threshold - Confidence threshold for aggregation
   * @returns Promise resolving to aggregated statistics
   */
  static async aggregateByConfidence(threshold: number): Promise<AggregatedResults> {
    const aggregation = await this.aggregate([
      {
        $match: {
          status: AnalysisStatus.COMPLETED,
          confidence: { $gte: threshold }
        }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          averageConfidence: { $avg: '$confidence' },
          minProcessingTime: { $min: '$processingTime' },
          maxProcessingTime: { $max: '$processingTime' },
          avgProcessingTime: { $avg: '$processingTime' }
        }
      }
    ]);

    const confidenceDistribution = await this.aggregate([
      {
        $match: {
          status: AnalysisStatus.COMPLETED,
          confidence: { $gte: threshold }
        }
      },
      {
        $bucket: {
          groupBy: '$confidence',
          boundaries: [0, 0.2, 0.4, 0.6, 0.8, 1],
          default: 'other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    const result = aggregation[0];
    return {
      totalCount: result.totalCount,
      averageConfidence: result.averageConfidence,
      confidenceDistribution: Object.fromEntries(
        confidenceDistribution.map(bucket => [bucket._id, bucket.count])
      ),
      processingTimeStats: {
        min: result.minProcessingTime,
        max: result.maxProcessingTime,
        avg: result.avgProcessingTime
      }
    };
  }
}

export default AnalysisModel;