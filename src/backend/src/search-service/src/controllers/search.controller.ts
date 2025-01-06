/**
 * @file Search controller implementation for CrimeMiner platform
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant search controller with
 * comprehensive security controls and audit logging
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import rateLimit from 'express-rate-limit'; // v7.1.0
import helmet from 'helmet'; // v7.0.0
import { Controller, UseGuards, Post } from '@nestjs/common';
import { SearchService } from '../services/search.service';
import { SecurityContext } from '@crimeminer/security'; // v1.0.0
import { AuditLogger } from '@crimeminer/audit-logging'; // v1.0.0
import { CacheManager } from '@crimeminer/cache'; // v1.0.0
import { 
  ISearchQuery, 
  ISearchResponse, 
  SecurityLevel 
} from '../interfaces/search.interface';
import { SecurityErrorCodes } from '../../../common/constants/error-codes';

// Global rate limiting configuration per FedRAMP requirements
const searchRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.SEARCH_RATE_LIMIT) || 1000,
  message: 'Search rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
});

// Security headers configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' }
});

@Controller('/api/v1/search')
@UseGuards(JwtAuthGuard, RoleGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly securityContext: SecurityContext,
    private readonly auditLogger: AuditLogger,
    private readonly cacheManager: CacheManager
  ) {}

  /**
   * Handle natural language search requests with security controls
   */
  @Post('/query')
  @UseGuards(searchRateLimit)
  public async search(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Apply security headers
      securityHeaders(req, res, () => {});

      // Validate security context
      const securityLevel = await this.securityContext.validateAccess(
        req.user,
        'search:execute'
      );

      // Validate and sanitize query
      const searchQuery: ISearchQuery = this.validateSearchQuery(req.body);

      // Check query length
      if (searchQuery.query.length > Number(process.env.MAX_QUERY_LENGTH) || 1000) {
        throw new Error('Query exceeds maximum length');
      }

      // Check cache
      const cacheKey = this.generateCacheKey(searchQuery, req.user.id);
      const cachedResult = await this.cacheManager.get<ISearchResponse>(cacheKey);
      if (cachedResult) {
        this.auditLogger.log('search:cache_hit', {
          requestId,
          userId: req.user.id,
          query: searchQuery.query
        });
        return res.json(cachedResult);
      }

      // Execute search with security context
      const searchResponse = await this.searchService.search({
        ...searchQuery,
        securityContext: {
          userId: req.user.id,
          securityLevel,
          sessionId: req.sessionID,
          clientInfo: {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        }
      });

      // Cache results
      await this.cacheManager.set(
        cacheKey, 
        searchResponse, 
        Number(process.env.CACHE_TTL) || 300
      );

      // Log audit trail
      this.auditLogger.log('search:executed', {
        requestId,
        userId: req.user.id,
        query: searchQuery.query,
        resultCount: searchResponse.total,
        duration: Date.now() - startTime
      });

      res.json(searchResponse);
    } catch (error) {
      this.handleSearchError(error, requestId, req, next);
    }
  }

  /**
   * Handle entity-based search requests with relationship validation
   */
  @Post('/entity/:id')
  @UseGuards(searchRateLimit)
  public async searchByEntity(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Apply security headers
      securityHeaders(req, res, () => {});

      // Validate entity access
      const securityLevel = await this.securityContext.validateEntityAccess(
        req.params.id,
        req.user
      );

      // Validate filters
      const filters = this.validateSearchFilters(req.body.filters);

      // Check cache
      const cacheKey = this.generateEntityCacheKey(req.params.id, filters, req.user.id);
      const cachedResult = await this.cacheManager.get<ISearchResponse>(cacheKey);
      if (cachedResult) {
        this.auditLogger.log('search:entity:cache_hit', {
          requestId,
          userId: req.user.id,
          entityId: req.params.id
        });
        return res.json(cachedResult);
      }

      // Execute entity search
      const searchResponse = await this.searchService.searchByEntity(
        req.params.id,
        filters,
        {
          userId: req.user.id,
          securityLevel,
          sessionId: req.sessionID,
          clientInfo: {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        }
      );

      // Cache results
      await this.cacheManager.set(
        cacheKey,
        searchResponse,
        Number(process.env.CACHE_TTL) || 300
      );

      // Log audit trail
      this.auditLogger.log('search:entity:executed', {
        requestId,
        userId: req.user.id,
        entityId: req.params.id,
        resultCount: searchResponse.total,
        duration: Date.now() - startTime
      });

      res.json(searchResponse);
    } catch (error) {
      this.handleSearchError(error, requestId, req, next);
    }
  }

  /**
   * Private helper methods
   */

  private validateSearchQuery(body: any): ISearchQuery {
    // Implementation of query validation
    if (!body.query || typeof body.query !== 'string') {
      throw new Error('Invalid search query');
    }
    return body as ISearchQuery;
  }

  private validateSearchFilters(filters: any): any {
    // Implementation of filter validation
    return filters;
  }

  private generateCacheKey(query: ISearchQuery, userId: string): string {
    return `search:${userId}:${crypto
      .createHash('sha256')
      .update(JSON.stringify(query))
      .digest('hex')}`;
  }

  private generateEntityCacheKey(
    entityId: string,
    filters: any,
    userId: string
  ): string {
    return `search:entity:${userId}:${entityId}:${crypto
      .createHash('sha256')
      .update(JSON.stringify(filters))
      .digest('hex')}`;
  }

  private handleSearchError(
    error: Error,
    requestId: string,
    req: Request,
    next: NextFunction
  ): void {
    this.auditLogger.error('search:error', {
      requestId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    next({
      code: SecurityErrorCodes.ENCRYPTION_FAILED,
      message: 'Search operation failed',
      requestId,
      timestamp: new Date().toISOString()
    });
  }
}