import express from 'express'
import request from 'supertest'
import { initQueue, closeQueue, enqueueEvent } from '../../src/infra/queue'
import { initDb, closeDb, getRepositoryByFullName, upsertRepository } from '../../src/infra/db'
import { getRedis, closeRedis, getFromCache, setToCache, delCache } from '../../src/infra/cache'
import webhooksRouter from '../../src/routes/webhooks'
import repositoriesRouter from '../../src/routes/repositories'
import { generateWebhookSignature, createMockWebhookPayload, createMockRepo, sleep } from '../helpers/testUtils'
import nock from 'nock'
import path from 'path'
import fs from 'fs'

/**
 * Integration tests for the complete webhook → queue → worker → db flow
 * 
 * Requirements:
 * - Redis must be running on localhost:6379
 * - Uses real BullMQ queue
 * - Uses SQLite in-memory database
 * - Mocks GitHub API with nock
 */

describe('Webhook Integration Flow', () => {
    let app: express.Application
    const TEST_DB_PATH = path.join(process.cwd(), 'data', 'integration-test.sqlite')

    beforeAll(async () => {
        // Set test environment
        process.env.SQLITE_PATH = TEST_DB_PATH
        process.env.GITHUB_WEBHOOK_SECRET = 'integration-test-secret'
        process.env.QUEUE_NAME = 'integration-test-events'
        process.env.REDIS_URL = 'redis://localhost:6379'

        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }

        // Initialize infrastructure
        initDb()
        await initQueue()

        // Create Express app
        app = express()
        app.use(express.json())
        app.use('/webhooks', webhooksRouter)
        app.use('/repositories', repositoriesRouter)
    })

    afterAll(async () => {
        await closeQueue()
        closeDb()
        await closeRedis()

        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }
    })

    beforeEach(async () => {
        // Clear Redis cache
        const redis = getRedis()
        await redis.flushdb()

        // Clear nock
        nock.cleanAll()
    })

    describe('Complete webhook processing flow', () => {
        test('should process webhook from ingestion to database', async () => {
            const mockRepo = createMockRepo({
                id: 12345,
                full_name: 'testorg/integration-repo',
                name: 'integration-repo',
                owner: { login: 'testorg', id: 999 }
            })

            // Mock GitHub API response
            nock('https://api.github.com')
                .get('/repos/testorg/integration-repo')
                .reply(200, mockRepo, {
                    'x-ratelimit-remaining': '4999',
                    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
                })

            const webhookPayload = createMockWebhookPayload('push', {
                repository: {
                    full_name: 'testorg/integration-repo',
                    name: 'integration-repo',
                    owner: { login: 'testorg' }
                }
            })

            const body = JSON.stringify(webhookPayload)
            const signature = generateWebhookSignature(body, 'integration-test-secret')

            // Step 1: Send webhook
            const webhookResponse = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(webhookResponse.status).toBe(201)
            expect(webhookResponse.body.status).toBe('queued')

            // Step 2: Wait for worker to process (BullMQ processes asynchronously)
            await sleep(3000)

            // Step 3: Verify repository was saved to database
            const savedRepo = getRepositoryByFullName('testorg/integration-repo')
            expect(savedRepo).toBeTruthy()
            expect(savedRepo.data.id).toBe(12345)
            expect(savedRepo.owner).toBe('testorg')

            // Step 4: Verify GitHub API was called
            expect(nock.isDone()).toBe(true)
        }, 10000)

        test('should invalidate cache after webhook event', async () => {
            const repoFullName = 'testorg/cache-test-repo'

            // Pre-populate cache
            await setToCache(`repositories:${repoFullName}`, JSON.stringify({ id: 999, old: true }), 300)

            // Verify cache exists
            const cached = await getFromCache(`repositories:${repoFullName}`)
            expect(cached).toBeTruthy()

            // Mock GitHub API
            nock('https://api.github.com')
                .get('/repos/testorg/cache-test-repo')
                .reply(200, createMockRepo({ id: 1000, full_name: repoFullName }))

            // Send webhook
            const webhookPayload = createMockWebhookPayload('push', {
                repository: {
                    full_name: repoFullName,
                    name: 'cache-test-repo',
                    owner: { login: 'testorg' }
                }
            })

            const body = JSON.stringify(webhookPayload)
            const signature = generateWebhookSignature(body, 'integration-test-secret')

            await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .send(body)

            // Wait for processing
            await sleep(3000)

            // Verify cache was invalidated
            const cachedAfter = await getFromCache(`repositories:${repoFullName}`)
            expect(cachedAfter).toBeNull()
        }, 10000)

        test('should handle multiple concurrent webhooks', async () => {
            const repos = [
                { name: 'repo1', id: 1001 },
                { name: 'repo2', id: 1002 },
                { name: 'repo3', id: 1003 }
            ]

            // Mock GitHub API for all repos
            repos.forEach(repo => {
                nock('https://api.github.com')
                    .get(`/repos/testorg/${repo.name}`)
                    .reply(200, createMockRepo({
                        id: repo.id,
                        full_name: `testorg/${repo.name}`,
                        name: repo.name
                    }))
            })

            // Send webhooks concurrently
            const webhookPromises = repos.map(repo => {
                const payload = createMockWebhookPayload('push', {
                    repository: {
                        full_name: `testorg/${repo.name}`,
                        name: repo.name,
                        owner: { login: 'testorg' }
                    }
                })
                const body = JSON.stringify(payload)
                const signature = generateWebhookSignature(body, 'integration-test-secret')

                return request(app)
                    .post('/webhooks')
                    .set('x-github-event', 'push')
                    .set('x-hub-signature-256', signature)
                    .send(body)
            })

            const responses = await Promise.all(webhookPromises)

            // All should be queued successfully
            responses.forEach(response => {
                expect(response.status).toBe(201)
            })

            // Wait for all to process
            await sleep(4000)

            // Verify all repos were saved
            repos.forEach(repo => {
                const saved = getRepositoryByFullName(`testorg/${repo.name}`)
                expect(saved).toBeTruthy()
                expect(saved.data.id).toBe(repo.id)
            })
        }, 15000)
    })

    describe('Repository retrieval with cache layers', () => {
        test('should return from cache on hit', async () => {
            const repoData = { full_name: 'owner/cached-repo', data: { id: 555 } }
            await setToCache('repositories:owner/cached-repo', JSON.stringify(repoData))

            const response = await request(app).get('/repositories/owner/cached-repo')

            expect(response.status).toBe(200)
            expect(response.headers['x-cache']).toBe('HIT')
            expect(response.body.data.id).toBe(555)
        })

        test('should fetch from DB on cache miss', async () => {
            upsertRepository('owner/db-repo', 'owner', { id: 666 })

            const response = await request(app).get('/repositories/owner/db-repo')

            expect(response.status).toBe(200)
            expect(response.headers['x-cache']).toBe('DB')
            expect(response.body.data.id).toBe(666)

            // Should now be cached
            const cached = await getFromCache('repositories:owner/db-repo')
            expect(cached).toBeTruthy()
        })

        test('should fetch from GitHub on cache and DB miss', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/github-repo')
                .reply(200, createMockRepo({ id: 777, full_name: 'owner/github-repo' }))

            const response = await request(app).get('/repositories/owner/github-repo')

            expect(response.status).toBe(200)
            expect(response.headers['x-cache']).toBe('GITHUB')
            expect(response.body.data.id).toBe(777)

            // Should be saved to DB
            const fromDb = getRepositoryByFullName('owner/github-repo')
            expect(fromDb).toBeTruthy()
            expect(fromDb.data.id).toBe(777)

            // Should be cached
            const cached = await getFromCache('repositories:owner/github-repo')
            expect(cached).toBeTruthy()
        })

        test('should return 404 when repository not found anywhere', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/nonexistent')
                .reply(404, { message: 'Not Found' })

            const response = await request(app).get('/repositories/owner/nonexistent')

            expect(response.status).toBe(404)
            expect(response.body.error).toBe('not found')
        })
    })

    describe('Error resilience', () => {
        test('should handle GitHub API errors gracefully', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/error-repo')
                .reply(500, { message: 'Internal Server Error' })

            const response = await request(app).get('/repositories/owner/error-repo')

            // Should return error but not crash
            expect([404, 500]).toContain(response.status)
        })

        test('should handle malformed webhook payloads', async () => {
            const invalidPayload = 'not-valid-json{'
            const signature = generateWebhookSignature(invalidPayload, 'integration-test-secret')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(invalidPayload)

            // Should handle gracefully (might be 400 or 500)
            expect([400, 500]).toContain(response.status)
        })
    })
})
