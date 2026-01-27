import express from 'express'
import crypto from 'crypto'
import { enqueueEvent } from '../infra/queue'
import { config } from '../config'

const router = express.Router()

function verifySignature(secret: string, body: string, signature: string | undefined) {
  if (!secret) return true // if not configured, skip (dev)
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const digest = `sha256=${hmac.digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

router.post('/', express.text({ type: '*/*' }), async (req, res) => {
  const body = req.body as string
  const sig = req.header('x-hub-signature-256') || undefined

  if (!verifySignature(config.webhookSecret, body, sig)) {
    return res.status(401).json({ error: 'invalid signature' })
  }

  const event = req.header('x-github-event') || 'unknown'
  const payload = JSON.parse(body)

  // Enqueue the raw event for asynchronous processing
  await enqueueEvent({ event, payload })

  res.status(201).json({ status: 'queued' })
})

export default router
