import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import repositoriesRouter from './routes/repositories'
import webhooksRouter from './routes/webhooks'
import metricsRouter from './routes/metrics'
import { initQueue, closeQueue } from './infra/queue'
import { closeDb } from './infra/db'
import { closeRedis } from './infra/cache'
import { getRedis } from './infra/cache'
import { getQueueCounts } from './infra/queue'

dotenv.config()

const app = express()
app.use(bodyParser.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/readyz', async (_req, res) => {
  try {
    const r = getRedis()
    // ping may throw if redis not ready
    if (r && typeof r.ping === 'function') await r.ping()
    const counts = await getQueueCounts()
    res.json({ redis: 'ok', queue: counts })
  } catch (e) {
    res.status(503).json({ error: 'not ready', details: String(e) })
  }
})

app.use('/repositories', repositoriesRouter)
app.use('/webhooks', webhooksRouter)
app.use('/metrics', metricsRouter)

const port = process.env.PORT || 3000

// Inicializar recursos asíncronos (colas, redis, etc.)
let server: any = null
initQueue().then(() => {
  server = app.listen(port, () => {
    console.log(`GitSpy API listening on port ${port}`)
  })
}).catch(err => {
  console.error('Failed to initialize queue:', err)
  process.exit(1)
})

async function shutdown(signal?: string) {
  console.log('Shutting down', signal || '')
  try {
    if (server) {
      server.close(() => console.log('HTTP server closed'))
    }
    await closeQueue()
  } catch (e) {
    console.warn('Error during shutdown', e)
  }
  try { closeDb() } catch (e) { /* ignore */ }
  try { await closeRedis() } catch (e) { /* ignore */ }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
