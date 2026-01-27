import crypto from 'crypto'

/**
 * Generate HMAC signature for webhook payloads
 */
export function generateWebhookSignature(payload: any, secret: string): string {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    return `sha256=${hmac.digest('hex')}`
}

/**
 * Create a mock job for BullMQ worker testing
 */
export function createMockJob(data: any, opts: any = {}) {
    return {
        id: opts.id || '1',
        name: opts.name || 'github:event',
        data,
        opts: opts.opts || {},
        attemptsMade: opts.attemptsMade || 0,
        timestamp: opts.timestamp || Date.now(),
        ...opts
    }
}

/**
 * Sleep utility for async tests
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        if (await condition()) return
        await sleep(interval)
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`)
}

/**
 * Create a mock GitHub repository response
 */
export function createMockRepo(overrides: any = {}) {
    return {
        id: 123456,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        owner: {
            login: 'owner',
            id: 789,
            type: 'User'
        },
        private: false,
        description: 'Test repository',
        fork: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: '2023-01-01T00:00:00Z',
        size: 100,
        stargazers_count: 10,
        watchers_count: 5,
        language: 'TypeScript',
        forks_count: 2,
        open_issues_count: 1,
        default_branch: 'main',
        ...overrides
    }
}

/**
 * Create a mock GitHub webhook payload
 */
export function createMockWebhookPayload(event: string, overrides: any = {}) {
    const basePayload = {
        repository: createMockRepo(),
        sender: {
            login: 'test-user',
            id: 999,
            type: 'User'
        }
    }

    switch (event) {
        case 'push':
            return {
                ...basePayload,
                ref: 'refs/heads/main',
                before: 'abc123',
                after: 'def456',
                commits: [],
                ...overrides
            }
        case 'repository':
            return {
                ...basePayload,
                action: 'created',
                ...overrides
            }
        case 'ping':
            return {
                ...basePayload,
                zen: 'Keep it simple',
                hook_id: 12345,
                ...overrides
            }
        default:
            return { ...basePayload, ...overrides }
    }
}
