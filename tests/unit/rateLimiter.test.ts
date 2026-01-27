import { updateFromHeaders, waitForAllowance, backoffUntilReset, getState } from '../../src/infra/rateLimiter'

describe('rateLimiter', () => {
    let originalDateNow: () => number

    beforeEach(() => {
        // Save original Date.now
        originalDateNow = Date.now

        // Reset state by updating with empty headers
        updateFromHeaders({})
    })

    afterEach(() => {
        // Restore original Date.now
        Date.now = originalDateNow
    })

    describe('updateFromHeaders', () => {
        test('should parse and update remaining from headers', () => {
            updateFromHeaders({ 'x-ratelimit-remaining': '100' })
            const state = getState()
            expect(state.remaining).toBe(100)
        })

        test('should parse and update resetAt from headers', () => {
            const resetTime = Math.floor(Date.now() / 1000) + 3600
            updateFromHeaders({ 'x-ratelimit-reset': String(resetTime) })
            const state = getState()
            expect(state.resetAt).toBe(resetTime)
        })

        test('should update both remaining and resetAt', () => {
            const resetTime = Math.floor(Date.now() / 1000) + 3600
            updateFromHeaders({
                'x-ratelimit-remaining': '4999',
                'x-ratelimit-reset': String(resetTime)
            })
            const state = getState()
            expect(state.remaining).toBe(4999)
            expect(state.resetAt).toBe(resetTime)
        })

        test('should handle missing headers gracefully', () => {
            updateFromHeaders({})
            const state = getState()
            // State should not crash, values may be unchanged
            expect(state).toBeDefined()
        })

        test('should handle invalid header values gracefully', () => {
            updateFromHeaders({
                'x-ratelimit-remaining': 'invalid',
                'x-ratelimit-reset': 'not-a-number'
            })
            const state = getState()
            // Should not crash, NaN is acceptable
            expect(state).toBeDefined()
        })
    })

    describe('waitForAllowance', () => {
        test('should allow immediately when remaining is Infinity', async () => {
            // Default state has Infinity remaining
            const start = Date.now()
            await waitForAllowance(1)
            const duration = Date.now() - start
            expect(duration).toBeLessThan(50) // Should be instant
        })

        test('should allow immediately when sufficient tokens available', async () => {
            updateFromHeaders({ 'x-ratelimit-remaining': '100' })
            const start = Date.now()
            await waitForAllowance(1)
            const duration = Date.now() - start
            expect(duration).toBeLessThan(50)
        })

        test('should decrement remaining after consuming tokens', async () => {
            updateFromHeaders({ 'x-ratelimit-remaining': '10' })
            await waitForAllowance(3)
            const state = getState()
            expect(state.remaining).toBe(7)
        })

        test('should wait until reset when tokens exhausted', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            const resetAt = nowSecs + 2 // 2 seconds in future

            updateFromHeaders({
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetAt)
            })

            const start = Date.now()
            await waitForAllowance(1)
            const duration = Date.now() - start

            // Should wait approximately 2 seconds (+ 500ms buffer)
            expect(duration).toBeGreaterThanOrEqual(1800)
            expect(duration).toBeLessThan(3500)
        })

        test('should not wait if reset time is in the past', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            const resetAt = nowSecs - 10 // 10 seconds ago

            updateFromHeaders({
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetAt)
            })

            const start = Date.now()
            await waitForAllowance(1)
            const duration = Date.now() - start

            // Should not wait long (just buffer time)
            expect(duration).toBeLessThan(1200)
        })
    })

    describe('backoffUntilReset', () => {
        test('should apply exponential backoff based on attempt', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            updateFromHeaders({ 'x-ratelimit-reset': String(nowSecs) })

            // Attempt 0: 2^0 * 1000 = 1000ms
            const start0 = Date.now()
            await backoffUntilReset(0)
            const duration0 = Date.now() - start0
            expect(duration0).toBeGreaterThanOrEqual(1000)
            expect(duration0).toBeLessThan(2100)

            // Attempt 1: 2^1 * 1000 = 2000ms
            const start1 = Date.now()
            await backoffUntilReset(1)
            const duration1 = Date.now() - start1
            expect(duration1).toBeGreaterThanOrEqual(2000)
            expect(duration1).toBeLessThanOrEqual(3100)
        })

        test('should cap backoff at 60 seconds', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            updateFromHeaders({ 'x-ratelimit-reset': String(nowSecs) })

            // Attempt 10: 2^10 * 1000 = 1024000ms, but should cap at 60000ms
            const start = Date.now()
            await backoffUntilReset(10)
            const duration = Date.now() - start

            // Should be capped at ~60 seconds
            expect(duration).toBeGreaterThanOrEqual(60000)
            expect(duration).toBeLessThan(62000)
        })

        test('should wait until reset time if longer than exponential backoff', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            const resetAt = nowSecs + 3 // 3 seconds in future

            updateFromHeaders({ 'x-ratelimit-reset': String(resetAt) })

            // Attempt 0: exponential = 1s, but reset = 3s, should wait 3s
            const start = Date.now()
            await backoffUntilReset(0)
            const duration = Date.now() - start

            expect(duration).toBeGreaterThanOrEqual(3000)
            expect(duration).toBeLessThanOrEqual(4000)
        })
    })

    describe('integration scenarios', () => {
        test('should handle typical GitHub API flow', async () => {
            // Initial state: plenty of tokens
            updateFromHeaders({
                'x-ratelimit-remaining': '5000',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
            })

            // Make several requests
            await waitForAllowance(1)
            await waitForAllowance(1)
            await waitForAllowance(1)

            const state = getState()
            expect(state.remaining).toBe(4997)
        })

        test('should handle rate limit exhaustion and recovery', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)

            // Simulate near-exhaustion
            updateFromHeaders({
                'x-ratelimit-remaining': '1',
                'x-ratelimit-reset': String(nowSecs + 1)
            })

            // Consume last token
            await waitForAllowance(1)
            expect(getState().remaining).toBe(0)

            // Next request should wait for reset
            const start = Date.now()
            await waitForAllowance(1)
            const duration = Date.now() - start

            expect(duration).toBeGreaterThanOrEqual(1000)
        })
    })
})
