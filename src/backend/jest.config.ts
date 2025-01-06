import type { Config } from '@jest/types'; // v29.5.0

const config: Config.InitialOptions = {
  // Test discovery and execution
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.security.test.ts'
  ],
  testEnvironment: 'node',
  preset: 'ts-jest',

  // Module resolution and path mapping
  moduleNameMapper: {
    '@common/(.*)': '<rootDir>/src/common/$1',
    '@services/(.*)': '<rootDir>/src/$1',
    '@security/(.*)': '<rootDir>/src/security/$1'
  },

  // Coverage configuration and thresholds
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'cobertura',
    'html',
    'json-summary'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.type.ts',
    '!src/**/index.ts',
    '!src/**/*.mock.ts',
    '!src/**/*.test.ts',
    '!src/types/**/*'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/security/**/*': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Test setup and environment configuration
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/security-setup.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/.git/'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],

  // TypeScript configuration
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true,
      diagnostics: {
        warnOnly: false,
        ignoreCodes: ['TS151001']
      }
    }
  },

  // Performance and resource management
  maxWorkers: '50%',
  testTimeout: 30000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,

  // Test isolation and cleanup
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Advanced configuration
  testSequencer: '<rootDir>/tests/sequencer.ts',
  errorOnDeprecated: true,
  notify: true,
  notifyMode: 'failure-change',
  bail: 1,
  logHeapUsage: true
};

export default config;