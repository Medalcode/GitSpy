// Global test setup
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token-mock'
process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
process.env.QUEUE_NAME = 'test-events'

// Increase timeout for integration tests (allow backoff tests up to 70s)
jest.setTimeout(70000)

// Use a stable Date.now that truncates to seconds to reduce timing flakiness
const _realNow = Date.now.bind(Date)
Date.now = () => Math.floor(_realNow() / 1000) * 1000
