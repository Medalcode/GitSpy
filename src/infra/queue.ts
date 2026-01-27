import { Queue, JobsOptions, Worker } from 'bullmq'
import { config } from '../config'
import { EventWorker } from '../workers/eventWorker'
import IORedis from 'ioredis'

let queue: Queue | null = null
let worker: Worker | null = null

export async function initQueue() {
  const connection = new IORedis(config.redisUrl)
  queue = new Queue(config.queueName, { connection })

  // Inicializar worker local (en producción cada worker sería un proceso separado)
  worker = new Worker(config.queueName, EventWorker, { connection })
  worker.on('error', (err) => console.error('Worker error', err))
}

export async function enqueueEvent(payload: any, opts?: JobsOptions) {
  if (!queue) throw new Error('Queue not initialized')
  await queue.add('github:event', payload, opts)
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
