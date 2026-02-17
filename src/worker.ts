import { initQueue, shutdownWorkerGracefully } from './infra/queue'
import { config } from './config'
import { closeDb } from './infra/db'
import { closeRedis } from './infra/cache'
import express from 'express'
import { getRegister } from './infra/metrics'

// Start queue and worker in a dedicated process. Register signal handlers to
// perform graceful shutdown: stop accepting new jobs, wait for active jobs
// to finish (bounded by timeout), then close queue and other resources.
async function start() {
  try {
    await initQueue({ startWorker: true })
    console.log(`Worker started for queue ${config.queueName}`)
  } catch (e) {
    console.error('Failed to start worker', e)
    process.exit(1)
  }

  const shuttingDown = { value: false }

  async function handleSignal(sig: string) {
    if (shuttingDown.value) return
    shuttingDown.value = true
    console.log('Worker received signal', sig, '- beginning graceful shutdown')
    try {
      // Pause intake and wait for active jobs to complete (30s default)
      await shutdownWorkerGracefully(30000)
    } catch (e) {
      console.warn('Error during graceful shutdown', e)
    }
    try { closeDb() } catch (e) { /* ignore */ }
    try { await closeRedis() } catch (e) { /* ignore */ }
    console.log('Worker shutdown complete')
    process.exit(0)
  }

  process.on('SIGINT', () => handleSignal('SIGINT'))
  process.on('SIGTERM', () => handleSignal('SIGTERM'))
}

// Start a small metrics endpoint so worker processes can be scraped independently
const metricsPort = Number(process.env.WORKER_METRICS_PORT || 9091)
const app = express()
app.get('/metrics/prom', async (_req, res) => {
  try {
    const register = getRegister()
    res.set('Content-Type', register.contentType)
    res.send(await register.metrics())
  } catch (e) {
    res.status(500).send('metrics_error')
  }
})
app.listen(metricsPort, () => console.log(`Worker metrics listening on ${metricsPort}`))

start()
