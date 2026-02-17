import { Queue, JobsOptions, Worker } from 'bullmq'
import { config } from '../config'
import { EventWorker } from '../workers/eventWorker'
import IORedis from 'ioredis'

let queue: Queue | null = null
let worker: Worker | null = null
let connection: any = null

export function getConnection() {
  if (connection) return connection
  connection = new IORedis(config.redisUrl)
  connection.on('error', (e: any) => console.error('Redis connection error', e))
  return connection
}

export async function initQueue() {
  const conn = getConnection()
  queue = new Queue(config.queueName, { connection: conn })
}

export async function initWorker(concurrency = 1) {
  const conn = getConnection()
  worker = new Worker(config.queueName, EventWorker, { connection: conn, concurrency })
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
  try {
    if (connection) {
      try { await connection.quit() } catch (e) { try { connection.disconnect() } catch (e) { /* ignore */ } }
      connection = null
    }
  } catch (e) { /* ignore */ }
}
