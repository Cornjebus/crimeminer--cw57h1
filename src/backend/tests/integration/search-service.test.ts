/**
 * @file Integration tests for CrimeMiner search service
 * @version 1.0.0
 * @description Tests search functionality with FedRAMP High and CJIS compliance validation
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'; // v29.0.0
import { Client } from '@elastic/elasticsearch'; // v8.9.0
import supertest from 'supertest'; // v6.3.0
import { SearchService } from '../../src/search-service/src/services/search.service';
import { ISearchQuery, ISearchResponse, SecurityLevel } from '../../src/search-service/src/interfaces/search.interface';
import { elasticsearchConfig } from '../../src/search-service/src/config/elasticsearch.config';
import { Logger } from '../../src/common/utils/logger.util';

// Test constants
const TEST_INDEX = 'test_crimeminer_encrypted';
const SAMPLE_QUERIES = ['suspicious activity', 'location coordinates', 'phone number'];
const PERFORMANCE_BATCH_SIZE = 1000;
const PERFORMANCE_TIMEOUT = 600000; // 10 minutes

// Security context for testing
const TEST_SECURITY_CONTEXT = {
  userId: 'test-investigator',
  roles: ['investigator'],
  clearanceLevel: 'confidential',
  sessionId: 'test-session',
  clientInfo: {
    ipAddress: '10.0.0.1',
    userAgent: 'test-agent'
  }
};

describe('Search Service Integration Tests', () => {
  let searchService: SearchService;
  let esClient: Client;
  let logger: Logger;
  let performanceMetrics: {
    responseTime: number[];
    throughput: number;
    resourceUsage: {
      cpu: number;
      memory: number;
    };
  };

  beforeAll(async () => {
    // Initialize secure ES client with FedRAMP compliant config
    esClient = new Client({
      ...elasticsearchConfig,
      ssl: {
        rejectUnauthorized: true,
        ca: process.env.ES_CA_CERT,
        cert: process.env.ES_CLIENT_CERT,
        key: process.env.ES_CLIENT_KEY
      }
    });

    // Initialize logger with security audit
    logger = new Logger('search-service-test', {
      level: 'debug',
      filepath: 'logs/search-test-%DATE%.log'
    });

    // Initialize search service with security context
    searchService = new SearchService();

    // Setup test index with security mappings
    await setupTestIndex();

    // Load encrypted test data
    await loadTestData();

    // Initialize performance metrics
    performanceMetrics = {
      responseTime: [],
      throughput: 0,
      resourceUsage: { cpu: 0, memory: 0 }
    };
  }, 30000);

  afterAll(async () => {
    // Verify and archive audit logs
    await verifyAuditLogs();

    // Clean up test data securely
    await cleanupTestData();

    // Generate performance report
    await generatePerformanceReport();

    // Close connections
    await esClient.close();
  });

  describe('Natural Language Search', () => {
    test('should perform secure full-text search with encryption', async () => {
      const query: ISearchQuery = {
        query: 'suspicious activity near warehouse',
        filters: {
          securityLevel: 'confidential',
          mediaTypes: ['audio', 'video'],
          dateRange: {
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-01-31')
          }
        },
        encryptionParams: {
          keyId: 'test-key-1',
          algorithm: 'AES256',
          fields: ['content', 'metadata']
        },
        auditContext: {
          userId: TEST_SECURITY_CONTEXT.userId,
          sessionId: TEST_SECURITY_CONTEXT.sessionId,
          purpose: 'integration-test'
        }
      };

      const startTime = Date.now();
      const response = await searchService.search(query);
      const endTime = Date.now();

      // Verify response structure
      expect(response).toBeDefined();
      expect(response.total).toBeGreaterThan(0);
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.auditInfo).toBeDefined();

      // Verify security compliance
      response.results.forEach(result => {
        expect(result.securityLevel).toBeDefined();
        expect(result.classification).toBeDefined();
        expect(result.highlights).toBeDefined();
      });

      // Record performance metrics
      performanceMetrics.responseTime.push(endTime - startTime);
    }, 30000);

    test('should enforce security level restrictions', async () => {
      const restrictedQuery: ISearchQuery = {
        query: 'classified information',
        filters: {
          securityLevel: 'restricted',
          classification: {
            minClearanceLevel: 'restricted',
            compartments: ['SPECIAL_ACCESS']
          }
        },
        auditContext: {
          userId: TEST_SECURITY_CONTEXT.userId,
          sessionId: TEST_SECURITY_CONTEXT.sessionId,
          purpose: 'security-test'
        }
      };

      await expect(searchService.search(restrictedQuery))
        .rejects
        .toThrow('Insufficient security clearance');
    });
  });

  describe('Entity-Based Search', () => {
    test('should perform secure entity relationship search', async () => {
      const entityQuery = {
        entityId: 'test-entity-1',
        filters: {
          securityLevel: 'confidential',
          entityTypes: ['person', 'location'],
          jurisdiction: ['federal']
        }
      };

      const response = await searchService.searchByEntity(
        entityQuery.entityId,
        entityQuery.filters
      );

      // Verify entity relationships
      expect(response.results).toBeDefined();
      expect(response.facets.entityTypes).toBeDefined();
      
      // Verify security context
      response.results.forEach(result => {
        expect(result.classification.level).toBeDefined();
        expect(result.classification.caveats).toBeDefined();
      });
    });
  });

  describe('Search Performance', () => {
    test('should meet performance requirements under load', async () => {
      // Generate large test dataset
      const testQueries = generateTestQueries(PERFORMANCE_BATCH_SIZE);
      
      const startTime = Date.now();
      const results = await Promise.all(
        testQueries.map(query => searchService.search(query))
      );
      const totalTime = Date.now() - startTime;

      // Verify performance metrics
      expect(totalTime).toBeLessThanOrEqual(600000); // 10 minutes
      expect(results.length).toBe(PERFORMANCE_BATCH_SIZE);

      // Calculate throughput
      performanceMetrics.throughput = PERFORMANCE_BATCH_SIZE / (totalTime / 1000);

      // Record resource usage
      const usage = process.resourceUsage();
      performanceMetrics.resourceUsage = {
        cpu: usage.userCPUTime,
        memory: process.memoryUsage().heapUsed
      };
    }, PERFORMANCE_TIMEOUT);
  });
});

// Helper functions

async function setupTestIndex(): Promise<void> {
  const indexExists = await esClient.indices.exists({ index: TEST_INDEX });
  if (indexExists) {
    await esClient.indices.delete({ index: TEST_INDEX });
  }

  await esClient.indices.create({
    index: TEST_INDEX,
    body: {
      settings: {
        number_of_shards: 5,
        number_of_replicas: 2,
        analysis: {
          analyzer: {
            evidence_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'stop', 'snowball']
            }
          }
        }
      },
      mappings: {
        properties: {
          content: {
            type: 'text',
            analyzer: 'evidence_analyzer',
            fields: {
              raw: { type: 'keyword' }
            }
          },
          securityLevel: { type: 'keyword' },
          classification: {
            properties: {
              level: { type: 'keyword' },
              caveats: { type: 'keyword' }
            }
          }
        }
      }
    }
  });
}

async function loadTestData(): Promise<void> {
  const testData = generateTestData();
  const operations = testData.flatMap(doc => [
    { index: { _index: TEST_INDEX } },
    doc
  ]);

  await esClient.bulk({ operations, refresh: true });
}

async function verifyAuditLogs(): Promise<void> {
  // Verify audit log integrity
  const auditLogs = await logger.getAuditLogs();
  expect(auditLogs).toBeDefined();
  expect(auditLogs.length).toBeGreaterThan(0);

  // Verify required CJIS fields
  auditLogs.forEach(log => {
    expect(log.userId).toBeDefined();
    expect(log.timestamp).toBeDefined();
    expect(log.action).toBeDefined();
    expect(log.clientInfo).toBeDefined();
  });
}

async function cleanupTestData(): Promise<void> {
  await esClient.indices.delete({ index: TEST_INDEX });
}

async function generatePerformanceReport(): Promise<void> {
  const report = {
    averageResponseTime: calculateAverage(performanceMetrics.responseTime),
    throughput: performanceMetrics.throughput,
    resourceUsage: performanceMetrics.resourceUsage,
    timestamp: new Date().toISOString()
  };

  await logger.info('Performance Test Results', { metrics: report });
}

function generateTestQueries(count: number): ISearchQuery[] {
  return Array.from({ length: count }, (_, i) => ({
    query: SAMPLE_QUERIES[i % SAMPLE_QUERIES.length],
    filters: {
      securityLevel: 'confidential',
      mediaTypes: ['audio', 'video', 'text']
    },
    auditContext: {
      userId: TEST_SECURITY_CONTEXT.userId,
      sessionId: TEST_SECURITY_CONTEXT.sessionId,
      purpose: 'performance-test'
    }
  }));
}

function calculateAverage(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}