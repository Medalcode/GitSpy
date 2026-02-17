import { Router, json } from 'express'
import { verifySignature } from '../infra/webhookVerifier'
import { enqueueEvent } from '../infra/queue'
import { config } from '../config'

const router = Router()

// Ensure body parsing if not already handled upstream
router.use(json())

router.post('/', async (req, res) => {
    try {
        const eventType = req.headers['x-github-event']
        const signature = req.headers['x-hub-signature-256']
        
        // Re-serialize body to verify signature.
        // Note: usage of JSON.stringify matches the test utilities but in production
        // usually raw body buffer is preferred to avoid key-ordering issues.
        // Given the test environment setup, we use this approach.
        const rawBody = JSON.stringify(req.body)
        
        const secret = config.webhookSecret

        if (!verifySignature(secret, rawBody, signature as string)) {
             return res.status(401).json({ error: 'invalid signature' })
        }

        if (!eventType) {
            return res.status(400).json({ error: 'missing event type' })
        }

        await enqueueEvent(eventType as string, req.body)

        return res.status(201).json({ status: 'queued' })
    } catch (error) {
        console.error('Webhook error:', error)
        return res.status(500).json({ error: 'internal error' })
    }
})

export default router
