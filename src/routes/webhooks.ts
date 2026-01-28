import express from 'express'
import crypto from 'crypto'
import { verifySignature, parseWebhookPayload } from '../infra/webhookVerifier'
import { enqueueEvent } from '../infra/queue'
import { config } from '../config'

const router = express.Router()

router.post('/', express.text({ type: '*/*' }), async (req, res) => {
  const body = req.body as string
  const sig = req.header('x-hub-signature-256') || undefined

  if (!verifySignature(config.webhookSecret, body, sig)) {
    return res.status(401).json({ error: 'invalid signature' })
  }

  const event = req.header('x-github-event') || 'unknown'
  const payload = parseWebhookPayload(body)
  const delivery = req.header('x-github-delivery')
  let eventId = delivery
  if (!eventId) {
    const h = crypto.createHash('sha256')
    h.update((event || '') + '|' + body)
    eventId = h.digest('hex')
  }

  // Enqueue the raw event for asynchronous processing
  try {
    await enqueueEvent({ event, payload, event_id: eventId })
  } catch (e) {
    return res.status(500).json({ error: 'enqueue failed' })
  }

  res.status(201).json({ status: 'queued' })
})

export default router
