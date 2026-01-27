import { updateFromHeaders, getState } from './rateLimiter'

describe('rateLimiter', () => {
  beforeEach(() => {
    // reset state by updating with undefined headers
    updateFromHeaders({})
  })

  test('updateFromHeaders should parse numeric headers', () => {
    const now = Math.floor(Date.now() / 1000)
    updateFromHeaders({ 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': String(now + 60) })
    const s = getState()
    expect(s.remaining).toBe(10)
    expect(s.resetAt).toBeGreaterThanOrEqual(now + 60)
  })
})
