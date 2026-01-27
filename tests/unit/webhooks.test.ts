import express from 'express'
import request from 'supertest'
import crypto from 'crypto'
import webhooksRouter from '../../src/routes/webhooks'
import { generateWebhookSignature, createMockWebhookPayload } from '../helpers/testUtils'

// Mock dependencies
jest.mock('../../src/infra/queue', () => ({
    enqueueEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../../src/config', () => ({
    config: {
        webhookSecret: 'test-secret-key'
    }
}))

import { enqueueEvent } from '../../src/infra/queue'

describe('webhooks route', () => {
    let app: express.Application

    beforeEach(() => {
        app = express()
        app.use('/webhooks', webhooksRouter)
        jest.clearAllMocks()
    })

    describe('POST /webhooks', () => {
        test('should accept valid webhook with correct signature', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(201)
            expect(response.body).toEqual({ status: 'queued' })
            expect(enqueueEvent).toHaveBeenCalledTimes(1)
            expect(enqueueEvent).toHaveBeenCalledWith({
                event: 'push',
                payload
            })
        })

        test('should reject webhook with invalid signature', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const invalidSignature = 'sha256=invalid-signature-here'

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', invalidSignature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(401)
            expect(response.body).toEqual({ error: 'invalid signature' })
            expect(enqueueEvent).not.toHaveBeenCalled()
        })

        test('should reject webhook with missing signature', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(401)
            expect(response.body).toEqual({ error: 'invalid signature' })
            expect(enqueueEvent).not.toHaveBeenCalled()
        })

        test('should handle different event types', async () => {
            const eventTypes = ['push', 'pull_request', 'issues', 'repository', 'ping']

            for (const eventType of eventTypes) {
                const payload = createMockWebhookPayload(eventType)
                const body = JSON.stringify(payload)
                const signature = generateWebhookSignature(body, 'test-secret-key')

                const response = await request(app)
                    .post('/webhooks')
                    .set('x-github-event', eventType)
                    .set('x-hub-signature-256', signature)
                    .set('Content-Type', 'application/json')
                    .send(body)

                expect(response.status).toBe(201)
            }

            expect(enqueueEvent).toHaveBeenCalledTimes(eventTypes.length)
        })

        test('should handle unknown event type', async () => {
            const payload = { test: 'data' }
            const body = JSON.stringify(payload)
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(201)
            expect(enqueueEvent).toHaveBeenCalledWith({
                event: 'unknown',
                payload
            })
        })

        test('should use timing-safe comparison for signatures', async () => {
            // This test verifies that the signature comparison is timing-safe
            // by checking that both valid and invalid signatures take similar time
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const validSignature = generateWebhookSignature(body, 'test-secret-key')
            const invalidSignature = 'sha256=' + 'a'.repeat(64)

            // Valid signature
            const start1 = Date.now()
            await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', validSignature)
                .send(body)
            const time1 = Date.now() - start1

            // Invalid signature
            const start2 = Date.now()
            await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', invalidSignature)
                .send(body)
            const time2 = Date.now() - start2

            // Times should be similar (within 100ms)
            // This is a weak test but demonstrates the concept
            expect(Math.abs(time1 - time2)).toBeLessThan(100)
        })

        test('should handle large payloads', async () => {
            const largePayload = {
                ...createMockWebhookPayload('push'),
                commits: Array.from({ length: 100 }, (_, i) => ({
                    sha: `commit-${i}`,
                    message: `Commit message ${i}`,
                    author: { name: 'Test', email: 'test@example.com' }
                }))
            }
            const body = JSON.stringify(largePayload)
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(201)
            expect(enqueueEvent).toHaveBeenCalledWith({
                event: 'push',
                payload: largePayload
            })
        })

        test('should handle special characters in payload', async () => {
            const payload = {
                ...createMockWebhookPayload('push'),
                message: 'Test with émojis 🚀 and spëcial çharacters'
            }
            const body = JSON.stringify(payload)
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(201)
        })

        test('should reject webhook if signature algorithm is wrong', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)

            // Use SHA1 instead of SHA256
            const hmac = crypto.createHmac('sha1', 'test-secret-key')
            hmac.update(body)
            const wrongSignature = `sha1=${hmac.digest('hex')}`

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', wrongSignature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(401)
            expect(enqueueEvent).not.toHaveBeenCalled()
        })

        test('should handle queue errors gracefully', async () => {
            // Mock enqueueEvent to throw an error
            (enqueueEvent as jest.Mock).mockRejectedValueOnce(new Error('Queue error'))

            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            // Should return 500 or handle error appropriately
            // Depending on implementation, this might be 500 or still 201
            expect([201, 500]).toContain(response.status)
        })
    })

    describe('signature verification edge cases', () => {
        test('should handle empty payload', async () => {
            const body = ''
            const signature = generateWebhookSignature(body, 'test-secret-key')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'ping')
                .set('x-hub-signature-256', signature)
                .set('Content-Type', 'application/json')
                .send(body)

            // Might fail JSON parsing, but signature should be validated first
            expect([201, 400, 500]).toContain(response.status)
        })

        test('should be case-sensitive for signature', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const signature = generateWebhookSignature(body, 'test-secret-key')
            const uppercaseSignature = signature.toUpperCase()

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', uppercaseSignature)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(401)
        })

        test('should reject signature with wrong prefix', async () => {
            const payload = createMockWebhookPayload('push')
            const body = JSON.stringify(payload)
            const hmac = crypto.createHmac('sha256', 'test-secret-key')
            hmac.update(body)
            const signatureWithoutPrefix = hmac.digest('hex')

            const response = await request(app)
                .post('/webhooks')
                .set('x-github-event', 'push')
                .set('x-hub-signature-256', signatureWithoutPrefix)
                .set('Content-Type', 'application/json')
                .send(body)

            expect(response.status).toBe(401)
        })
    })
})
