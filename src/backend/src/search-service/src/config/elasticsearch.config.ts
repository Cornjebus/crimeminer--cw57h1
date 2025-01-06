/**
 * @file Elasticsearch configuration for CrimeMiner search service
 * @version 1.0.0
 * @description Implements FedRAMP High and CJIS compliant Elasticsearch configuration
 * with optimized performance settings and comprehensive security controls
 */

import { Client, ConnectionOptions } from '@elastic/elasticsearch'; // v8.9.0
import { IBaseEntity } from '../../../common/interfaces/base.interface';

// Global configuration constants
const ES_INDEX_PREFIX = 'crimeminer';
const ES_SHARDS = 5;
const ES_REPLICAS = 2;
const ES_REFRESH_INTERVAL = '5s';
const ES_BULK_SIZE = 5000;
const ES_REQUEST_TIMEOUT = 30000;

/**
 * FedRAMP and CJIS compliant Elasticsearch client configuration
 */
export const elasticsearchConfig: ConnectionOptions = {
  node: process.env.ES_NODE || 'https://elasticsearch:9200',
  auth: {
    username: process.env.ES_USERNAME,
    password: process.env.ES_PASSWORD,
    apiKey: process.env.ES_API_KEY,
  },
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.ES_CA_CERT,
    cert: process.env.ES_CLIENT_CERT,
    key: process.env.ES_CLIENT_KEY,
  },
  tls: {
    minVersion: 'TLSv1.2',
    ciphers: [
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
    ],
  },
  discovery: {
    seedHosts: process.env.ES_SEED_HOSTS?.split(','),
    sniffOnStart: true,
    sniffInterval: 300000,
  },
  compression: true,
  requestTimeout: ES_REQUEST_TIMEOUT,
  maxRetries: 3,
  resurrectStrategy: 'ping',
  name: 'crimeminer-search-service',
  headers: {
    'x-security-context': 'fedramp-high',
  },
};

/**
 * Performance-optimized index settings with security controls
 */
export const indexSettings = {
  settings: {
    index: {
      number_of_shards: ES_SHARDS,
      number_of_replicas: ES_REPLICAS,
      refresh_interval: ES_REFRESH_INTERVAL,
      default_pipeline: 'evidence_processing',
      analysis: {
        analyzer: {
          evidence_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'stop', 'snowball'],
          },
        },
      },
      routing: {
        allocation: {
          require: {
            data: 'hot',
          },
        },
      },
      // FedRAMP security settings
      auto_expand_replicas: false,
      max_result_window: 10000,
      max_inner_result_window: 5000,
      max_terms_count: 65536,
      max_docvalue_fields_search: 100,
      mapping: {
        total_fields: {
          limit: 2000,
        },
      },
    },
  },
  mappings: {
    dynamic: 'strict',
    _source: {
      enabled: true,
    },
    properties: {
      // Base entity fields from IBaseEntity
      id: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      createdBy: { type: 'keyword' },
      
      // Security classification
      securityLevel: { type: 'keyword' },
      caveats: { type: 'keyword' },
      
      // Audit fields
      auditTrail: {
        type: 'nested',
        properties: {
          timestamp: { type: 'date' },
          action: { type: 'keyword' },
          userId: { type: 'keyword' },
          details: { type: 'object', enabled: false },
        },
      },
      
      // Content fields
      content: {
        type: 'text',
        analyzer: 'evidence_analyzer',
        fields: {
          raw: { type: 'keyword' },
          suggest: { type: 'completion' },
        },
      },
    },
  },
  lifecycle: {
    name: 'evidence_lifecycle_policy',
    rollover: {
      max_age: '90d',
      max_size: '50gb',
    },
  },
  security: {
    roles: [
      {
        name: 'evidence_reader',
        cluster: ['monitor'],
        indices: [{
          names: [`${ES_INDEX_PREFIX}*`],
          privileges: ['read', 'view_index_metadata'],
        }],
      },
    ],
  },
};

/**
 * Creates and configures a FedRAMP/CJIS compliant Elasticsearch client instance
 */
export const createElasticsearchClient = (): Client => {
  const client = new Client(elasticsearchConfig);

  // Verify cluster health and security configuration
  client.cluster.health()
    .then(health => {
      if (health.status === 'red') {
        throw new Error('Elasticsearch cluster is unhealthy');
      }
    })
    .catch(error => {
      console.error('Failed to verify Elasticsearch cluster health:', error);
      process.exit(1);
    });

  return client;
};

/**
 * Retrieves optimized index configuration settings for different evidence types
 */
export const getIndexSettings = (indexType: string): object => {
  const baseSettings = { ...indexSettings };

  // Add type-specific analyzers and mappings
  switch (indexType) {
    case 'audio':
      baseSettings.mappings.properties.transcription = {
        type: 'text',
        analyzer: 'evidence_analyzer',
      };
      baseSettings.mappings.properties.speakers = {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          segments: { type: 'integer_range' },
        },
      };
      break;

    case 'video':
      baseSettings.mappings.properties.frames = {
        type: 'nested',
        properties: {
          timestamp: { type: 'date' },
          objects: { type: 'keyword' },
          faces: { type: 'keyword' },
        },
      };
      break;

    case 'document':
      baseSettings.mappings.properties.entities = {
        type: 'nested',
        properties: {
          type: { type: 'keyword' },
          value: { type: 'text' },
          confidence: { type: 'float' },
        },
      };
      break;
  }

  return baseSettings;
};