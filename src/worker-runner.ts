import dotenv from 'dotenv'
import { initQueue, initWorker, closeQueue } from './infra/queue'

dotenv.config()

async function start() {
  try {
    await initQueue()
    await initWorker()
    console.log('Worker runner started')
  } catch (e) {
    console.error('Failed to start worker runner', e)
    process.exit(1)
  }
}

start()

async function shutdown(signal?: string) {
  console.log('Worker shutting down', signal || '')
  try { await closeQueue() } catch (e) { console.warn('Error closing queue', e) }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
