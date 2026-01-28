import { Job } from 'bullmq'
import crypto from 'crypto'
import { fetchRepo } from '../infra/githubAdapter'
import { delCache, delByPattern, getRedis } from '../infra/cache'
import { saveEvent } from '../infra/db'
import { saveRepositoryFromGitHub } from '../core/repository'
import { jobsProcessed, jobsFailed, jobsRetried, jobDurationMs } from '../infra/metrics'

// Deduplication/locking strategy:
// - Each event should carry a stable `event_id` (header `x-github-delivery` or
//   deterministic hash of event type + payload).
// - Redis keys: `events:<id>:state` -> received|processing|processed|failed
//               `events:<id>:lock`  -> short-lived lock to avoid concurrent processing
// - Worker acquires lock (SET NX PX) before processing. If lock cannot be
//   acquired, the job is acknowledged (another worker is processing it).
// - On success, state -> processed; on failure, state -> failed (kept for inspection).

export async function EventWorker(job: Job) {
  const payload = job.data
  const eventType = payload.event || payload.event_type || 'unknown'
  const eventId = payload.event_id || null
  console.log('Processing job', job.id, eventType, eventId || '')

  const redis = getRedis()

  // Resolve/compute event id if missing (defensive)
  let resolvedEventId = eventId
  if (!resolvedEventId) {
    try {
      const sh = crypto.createHash('sha256')
      sh.update((payload.event || '') + '|' + JSON.stringify(payload.payload ?? payload))
      resolvedEventId = sh.digest('hex')
    } catch (_) {
      resolvedEventId = `job-${job.id}`
    }
  }

  const stateKey = `events:${resolvedEventId}:state`
  const lockKey = `events:${resolvedEventId}:lock`
  const lockTtl = 120000 // 2 minutes

  // Fast-path: if already processed, acknowledge and exit
  try {
    const st = await redis.get(stateKey)
    if (st === 'processed') {
      console.log('Event already processed; acking job', resolvedEventId)
      return
    }
  } catch (e) {
    console.warn('Failed to check event state from Redis', e)
  }

  // Try to acquire lock
  let lockAcquired = false
  // Start timer for duration metric
  const startTs = Date.now()

  try {
    const lockRes = await redis.set(lockKey, String(process.pid || Date.now()), 'NX', 'PX', lockTtl)
    lockAcquired = lockRes === 'OK' || lockRes === true
    if (!lockAcquired) {
      console.log('Could not acquire lock for event; another worker may be processing it', resolvedEventId)
      return
    }

    // Mark processing state
    try { await redis.set(stateKey, 'processing') } catch (e) { /* best-effort */ }
  } catch (e) {
    console.warn('Error acquiring lock in Redis; proceeding without lock', e)
  }

  try {
    // Persistir el evento en la base de datos si está disponible
    try {
      await saveEvent(eventType, payload.payload ?? payload)
    } catch (e) {
      console.warn('Failed to persist event', e)
    }

    // Invalidate repository caches conservatively for repository-related events
    if (eventType === 'push' || eventType === 'repository' || eventType === 'ping') {
      if (payload.payload && payload.payload.repository) {
        const repo = payload.payload.repository
        const key = `repositories:${repo.full_name}`
        try {
          // delete exact key and related page caches
          await delCache(key)
          await delByPattern(`repositories:page:*`)
          // delete any other keys that include the full_name
          await delByPattern(`repositories:*${repo.full_name}*`)
        } catch (e) {
          console.warn('Failed to delete cache key(s) for', key, e)
        }
      }
    }

    // Fetch latest repo info and upsert into DB (respetando rate limits en el adapter)
    if (payload.payload && payload.payload.repository) {
      const owner = payload.payload.repository.owner?.login
      const name = payload.payload.repository.name
      if (owner && name) {
        const gh = await fetchRepo(owner, name)
        if (gh) {
          try {
            await saveRepositoryFromGitHub(gh)
          } catch (e) {
            console.warn('Failed to save repo to DB', e)
          }
        }
      }
    }

    // Success: mark processed
    try { await redis.set(stateKey, 'processed') } catch (e) { /* ignore */ }
    try { jobsProcessed.inc({ event_type: eventType }) } catch (e) { /* ignore */ }
    try { const dur = Date.now() - startTs; jobDurationMs.observe({ event_type: eventType }, dur) } catch (e) { /* ignore */ }
  } catch (err) {
    // Failure: record failed state for inspection and rethrow to allow retries
    try { await redis.set(stateKey, 'failed') } catch (e) { /* ignore */ }
    console.error('EventWorker error', err)
    try { jobsFailed.inc({ event_type: eventType }) } catch (e) { /* ignore */ }
    // If this is a retry, increment retried metric
    try { if ((job.attemptsMade || 0) > 0) jobsRetried.inc({ event_type: eventType }) } catch (e) { /* ignore */ }
    throw err
  } finally {
    // Release lock if we acquired it
    try {
      if (lockAcquired) await redis.del(lockKey)
    } catch (e) {
      console.warn('Failed to release lock for event', resolvedEventId, e)
    }
  }
}

export default EventWorker
