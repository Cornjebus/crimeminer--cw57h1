import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // v29.0.0
import { Client } from '@elastic/elasticsearch'; // v8.9.0
import { AuditLogger } from '@company/audit-logger'; // v1.0.0
import { SearchService } from '../../../src/search-service/src/services/search.service';
import { ISearchQuery, ISearchResponse, ISearchFilters, SecurityLevel } from '../../../src/search-service/src/interfaces/search.interface';
import { SecurityErrorCodes } from '../../../src/common/constants/error-codes';

// Mock external dependencies
jest.mock('@elastic/elasticsearch');
jest.mock('@company/audit-logger');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockElasticsearchClient: jest.Mocked<Client>;
  let mockAuditLogger: jest.Mocked<AuditLogger>;

  // Test data constants
  const mockSecurityContext = {
    userId: 'test-user',
    roles: ['investigator'],
    permissions: ['search:read'],
    securityClearance: 'confidential'
  };

  const mockSearchResponse = {
    hits: {
      total: { value: 100 },
      hits: [
        {
          _id: 'doc1',
          _source: {
            title: 'Test Evidence',
            mediaType: 'audio',
            securityLevel: 'confidential',
            caseId: 'case123'
          }
        }
      ]
    },
    took: 50,
    timed_out: false,
    _shards: { total: 5, successful: 5, failed: 0 }
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Initialize mock Elasticsearch client
    mockElasticsearchClient = {
      search: jest.fn().mockResolvedValue(mockSearchResponse),
      cluster: { health: jest.fn().mockResolvedValue({ status: 'green' }) }
    } as unknown as jest.Mocked<Client>;

    // Initialize mock audit logger
    mockAuditLogger = {
      logSearchOperation: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<AuditLogger>;

    // Initialize search service with mocks
    searchService = new SearchService();
    (searchService as any).esClient = mockElasticsearchClient;
    (searchService as any).auditLogger = mockAuditLogger;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Natural Language Search', () => {
    it('should process natural language queries correctly', async () => {
      const query: ISearchQuery = {
        query: 'find audio evidence from last week',
        filters: {
          mediaTypes: ['audio'],
          dateRange: {
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            endDate: new Date()
          }
        },
        securityContext: mockSecurityContext
      };

      const response = await searchService.search(query);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: expect.any(String),
          body: expect.objectContaining({
            query: expect.any(Object),
            filter: expect.any(Array)
          })
        })
      );
      expect(response.total).toBe(100);
      expect(response.results).toHaveLength(1);
      expect(mockAuditLogger.logSearchOperation).toHaveBeenCalled();
    });

    it('should apply security filters automatically', async () => {
      const query: ISearchQuery = {
        query: 'confidential documents',
        securityContext: mockSecurityContext
      };

      await searchService.search(query);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                filter: expect.arrayContaining([
                  { term: { securityLevel: 'confidential' } }
                ])
              })
            })
          })
        })
      );
    });

    it('should handle pagination parameters', async () => {
      const query: ISearchQuery = {
        query: 'test',
        pagination: { page: 2, limit: 25, offset: 25 },
        securityContext: mockSecurityContext
      };

      await searchService.search(query);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            from: 25,
            size: 25
          })
        })
      );
    });
  });

  describe('Entity Search', () => {
    it('should find related evidence by entity', async () => {
      const entityId = 'entity123';
      const filters: ISearchFilters = {
        mediaTypes: ['audio', 'video'],
        securityLevel: 'confidential'
      };

      await searchService.searchByEntity(entityId, filters);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                must: expect.arrayContaining([
                  { term: { 'entities.id': entityId } }
                ])
              })
            })
          })
        })
      );
    });

    it('should validate entity access permissions', async () => {
      const entityId = 'restricted-entity';
      const filters: ISearchFilters = {};
      
      mockElasticsearchClient.search.mockRejectedValueOnce(new Error('Access denied'));

      await expect(searchService.searchByEntity(entityId, filters))
        .rejects.toThrow('Access denied');

      expect(mockAuditLogger.logSearchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: expect.any(Error)
        })
      );
    });
  });

  describe('Security Compliance', () => {
    it('should enforce FedRAMP controls', async () => {
      const query: ISearchQuery = {
        query: 'test',
        securityContext: {
          ...mockSecurityContext,
          securityClearance: 'restricted'
        }
      };

      await expect(searchService.search(query))
        .rejects.toThrow(SecurityErrorCodes.INSUFFICIENT_CLEARANCE);
    });

    it('should maintain CJIS compliance', async () => {
      const query: ISearchQuery = {
        query: 'test',
        securityContext: mockSecurityContext,
        auditContext: {
          userId: 'test-user',
          sessionId: 'session123',
          purpose: 'investigation'
        }
      };

      await searchService.search(query);

      expect(mockAuditLogger.logSearchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          sessionId: 'session123',
          purpose: 'investigation'
        })
      );
    });

    it('should validate security context', async () => {
      const query: ISearchQuery = {
        query: 'test',
        securityContext: undefined
      };

      await expect(searchService.search(query))
        .rejects.toThrow('Invalid security context');
    });
  });

  describe('Performance', () => {
    it('should meet response time requirements', async () => {
      const query: ISearchQuery = {
        query: 'performance test',
        securityContext: mockSecurityContext
      };

      const startTime = Date.now();
      await searchService.search(query);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // 1 second max
    });

    it('should handle concurrent searches', async () => {
      const queries = Array(10).fill({
        query: 'concurrent test',
        securityContext: mockSecurityContext
      });

      const results = await Promise.all(
        queries.map(query => searchService.search(query))
      );

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.meta.timedOut).toBe(false);
      });
    });

    it('should optimize resource usage', async () => {
      const query: ISearchQuery = {
        query: 'resource test',
        securityContext: mockSecurityContext,
        pagination: { page: 1, limit: 1000, offset: 0 }
      };

      await searchService.search(query);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            _source: expect.arrayContaining(['id', 'title', 'mediaType']),
            track_total_hits: true
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockElasticsearchClient.search.mockRejectedValueOnce(new Error('Network error'));

      const query: ISearchQuery = {
        query: 'test',
        securityContext: mockSecurityContext
      };

      await expect(searchService.search(query))
        .rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      mockElasticsearchClient.search.mockRejectedValueOnce(new Error('Request timed out'));

      const query: ISearchQuery = {
        query: 'test',
        securityContext: mockSecurityContext
      };

      await expect(searchService.search(query))
        .rejects.toThrow('Request timed out');
    });

    it('should provide meaningful error messages', async () => {
      mockElasticsearchClient.search.mockRejectedValueOnce(
        new Error('Invalid search syntax')
      );

      const query: ISearchQuery = {
        query: 'test AND OR',
        securityContext: mockSecurityContext
      };

      await expect(searchService.search(query))
        .rejects.toThrow('Invalid search syntax');
    });
  });
});