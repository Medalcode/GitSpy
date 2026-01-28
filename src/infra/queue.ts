import { Queue, JobsOptions, Worker } from 'bullmq'
import { config } from '../config'
import { EventWorker } from '../workers/eventWorker'
import IORedis from 'ioredis'
import { getRedis } from './cache'
import crypto from 'crypto'
import { eventsReceived } from './metrics'

let queue: Queue | null = null
let worker: Worker | null = null

// Initialize the queue. By default this will also start a local worker so
// existing callers keep working. Pass { startWorker: false } to only create
// the queue connection and not start the worker (for HTTP servers).
export async function initQueue(opts?: { startWorker?: boolean }) {
  const startWorker = opts?.startWorker ?? true
  const connection = new IORedis(config.redisUrl)
  queue = new Queue(config.queueName, { connection })

  if (startWorker) {
    // Inicializar worker local (en producción cada worker sería un proceso separado)
    worker = new Worker(config.queueName, EventWorker, { connection })
    worker.on('error', (err) => console.error('Worker error', err))
  }
}

export async function initWorker() {
  if (!queue) {
    // Ensure queue is initialized and create it if needed
    await initQueue({ startWorker: false })
  }
  if (worker) return
  const connection = new IORedis(config.redisUrl)
  worker = new Worker(config.queueName, EventWorker, { connection })
  worker.on('error', (err) => console.error('Worker error', err))
}

export async function enqueueEvent(payload: any, opts?: JobsOptions) {
  if (!queue) throw new Error('Queue not initialized')
  // Default job policy: safe retries and exponential backoff.
  // Callers can still pass `opts` to override these values per-job.
  const defaultOpts: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }

  const finalOpts: JobsOptions = Object.assign({}, defaultOpts, opts || {})
  // Determine stable event id: prefer provided `event_id`, otherwise use
  // payload.payload.id (if present), otherwise hash deterministically
  const providedId = payload?.event_id
  let eventId = providedId
  if (!eventId) {
    const candidate = payload?.payload?.id || payload?.payload?.hook_id || ''
    if (candidate) eventId = String(candidate)
    else {
      // Use sha256(event + '|' + JSON.stringify(payload.payload || payload))
      const sh = crypto.createHash('sha256')
      sh.update((payload.event || '') + '|' + JSON.stringify(payload.payload ?? payload))
      eventId = sh.digest('hex')
    }
  }

  const redis = getRedis()
  const stateKey = `events:${eventId}:state`

  try {
    const existing = await redis.get(stateKey)
    if (existing === 'processed') {
      // Already processed — skip enqueue to avoid duplicate work
      console.log('Skipping enqueue: event already processed', eventId)
      return
    }

    // Mark as received if not present. Use SETNX semantics via SET with NX.
    try {
      await redis.set(stateKey, 'received', 'NX')
    } catch (e) {
      // Best-effort: if we cannot mark, continue to enqueue
      console.warn('Failed to mark event state as received', e)
    }
  } catch (e) {
    console.warn('Error checking event state in Redis, proceeding to enqueue', e)
  }

  // Metrics: increment received counter (label by event type if available)
  try { eventsReceived.inc({ event_type: payload.event || 'unknown' }) } catch (e) { /* ignore */ }

  // Attach event_id to payload for worker-level dedupe/locking
  const jobPayload = Object.assign({}, payload, { event_id: eventId })
  await queue.add('github:event', jobPayload, finalOpts)
}

export async function getQueueCounts() {
  if (!queue) return {}
  try {
    return await queue.getJobCounts()
  } catch (err) {
    console.error('Failed to get queue counts', err)
    return {}
  }
}

export async function closeQueue() {
  try {
    if (worker) await worker.close()
  } catch (e) {
    console.warn('Error closing worker', e)
  }
  try {
    if (queue) await queue.close()
  } catch (e) {
    console.warn('Error closing queue', e)
  }
}

// Graceful shutdown helper: pause accepting new jobs, wait for active jobs to finish
// (implemented via `worker.pause()` + `worker.close()`), and then close the queue.
// `timeoutMs` limits wait time for active jobs to complete; if exceeded we still
// attempt to close and log the situation.
export async function shutdownWorkerGracefully(timeoutMs = 30000) {
  if (!worker) return
  try {
    // Stop fetching new jobs locally
    try { await worker.pause(true) } catch (e) { console.warn('Failed to pause worker', e) }

    // Wait for close, but don't hang forever — use a timeout.
    const closePromise = worker.close()
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    try {
      await Promise.race([closePromise, timeoutPromise])
    } catch (e) {
      console.warn('Graceful worker shutdown timed out or failed', e)
      // Try to close again (best-effort)
      try { await worker.close() } catch (e2) { console.warn('Forced worker close failed', e2) }
    }
  } finally {
    // Ensure queue is closed as well
    try { if (queue) await queue.close() } catch (e) { console.warn('Error closing queue during shutdown', e) }
  }
}
