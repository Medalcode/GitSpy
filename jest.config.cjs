module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/config/*.ts',
    '!src/types/*.ts'
  ],

  coverageThresholds: {
    global: {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    './src/infra/rateLimiter.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    },
    './src/routes/webhooks.ts': {
      statements: 100,
      branches: 100
    }
  },

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Timeouts (increase to allow long backoff tests)
  testTimeout: 70000,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true
}
