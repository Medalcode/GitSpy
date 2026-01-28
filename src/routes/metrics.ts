import express from 'express'
import { getState as getRateState } from '../infra/rateLimiter'
import { getQueueCounts } from '../infra/queue'
import metrics, { getRegister } from '../infra/metrics'

const router = express.Router()

// JSON health-style metrics
router.get('/', async (_req, res) => {
  const rateState = getRateState()
  let queueCounts = {}
  try {
    queueCounts = await getQueueCounts()
  } catch (e) {
    queueCounts = { error: 'unavailable' }
  }

  res.json({
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
    rateLimiter: rateState,
    queue: queueCounts
  })
})

// Prometheus metrics
const register = getRegister()

// Queue gauges are created ad-hoc per-process in this endpoint using the
// shared registry so they are exposed alongside other metrics.
const client = require('prom-client')

const gaugeRateRemaining = new client.Gauge({ name: 'gitspy_rate_remaining', help: 'GitHub rate limit remaining', registers: [register] })
const gaugeRateReset = new client.Gauge({ name: 'gitspy_rate_reset_unix', help: 'GitHub rate limit reset (unix seconds)', registers: [register] })

const gaugeQueueWaiting = new client.Gauge({ name: 'gitspy_queue_waiting', help: 'Jobs waiting in queue', registers: [register] })
const gaugeQueueActive = new client.Gauge({ name: 'gitspy_queue_active', help: 'Jobs active in queue', registers: [register] })
const gaugeQueueDelayed = new client.Gauge({ name: 'gitspy_queue_delayed', help: 'Jobs delayed in queue', registers: [register] })
const gaugeQueueFailed = new client.Gauge({ name: 'gitspy_queue_failed', help: 'Jobs failed in queue', registers: [register] })
const gaugeQueueCompleted = new client.Gauge({ name: 'gitspy_queue_completed', help: 'Jobs completed in queue', registers: [register] })

router.get('/prom', async (_req, res) => {
  try {
    const rateState = getRateState()
    gaugeRateRemaining.set(isFinite(rateState.remaining as number) ? Number(rateState.remaining) : 0)
    gaugeRateReset.set(Number(rateState.resetAt) || 0)

    let qc: any = {}
    try {
      qc = await getQueueCounts()
    } catch (_) { qc = {} }

    gaugeQueueWaiting.set(Number(qc.waiting || qc.wait || 0))
    gaugeQueueActive.set(Number(qc.active || 0))
    gaugeQueueDelayed.set(Number(qc.delayed || 0))
    gaugeQueueFailed.set(Number(qc.failed || 0))
    gaugeQueueCompleted.set(Number(qc.completed || 0))

    res.set('Content-Type', register.contentType)
    res.send(await register.metrics())
  } catch (e) {
    res.status(500).send('metrics_error')
  }
})

export default router
