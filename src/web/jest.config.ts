import type { Config } from '@jest/types';

// Create secure Jest configuration meeting FedRAMP High and CJIS requirements
const config: Config.InitialOptions = {
  // Use jsdom for secure browser environment simulation
  testEnvironment: 'jsdom',

  // Define secure test roots
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // Configure secure test setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/security/setup.ts'
  ],

  // Define security-focused test patterns
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/?(*.)+(spec|test).+(ts|tsx)',
    '**/security/**/*.test.+(ts|tsx)'
  ],

  // Configure secure transformers for different file types
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.svg$': 'jest-transform-stub',
    '^.+\\.(css|scss)$': 'jest-transform-stub'
  },

  // Secure module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@constants/(.*)$': '<rootDir>/src/constants/$1',
    '^@security/(.*)$': '<rootDir>/src/security/$1'
  },

  // Enable comprehensive coverage collection
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    'src/security/**/*.{ts,tsx}'
  ],

  // Set strict coverage thresholds for compliance
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/security/**/*.{ts,tsx}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Configure secure timeouts for test operations
  testTimeout: 10000,

  // Supported file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Watch plugins for improved developer experience
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Limit parallel test execution for resource control
  maxWorkers: '50%',

  // Configure secure test environment options
  testEnvironmentOptions: {
    url: 'http://localhost',
    testTimeout: 5000
  },

  // Enable verbose output for detailed test results
  verbose: true,

  // Reset mocks between tests for isolation
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true
};

export default config;