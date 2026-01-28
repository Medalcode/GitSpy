import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import repositoriesRouter from './routes/repositories'
import webhooksRouter from './routes/webhooks'
import metricsRouter from './routes/metrics'
import kanbanRouter from './routes/kanban'
import { initQueue, closeQueue } from './infra/queue'
import { closeDb } from './infra/db'
import { closeRedis } from './infra/cache'
import { config } from './config'

dotenv.config()

// Validate required environment in production to avoid accidental insecure deployments
if (config.env === 'production') {
  if (!config.webhookSecret) {
    console.error('Missing required environment variable: GITHUB_WEBHOOK_SECRET (required in production)')
    process.exit(1)
  }
}

const app = express()
app.use(bodyParser.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Simple root handler to avoid 500 on '/'
app.get('/', (_req, res) => res.send('GitSpy API is running'))

app.use('/repositories', repositoriesRouter)
app.use('/webhooks', webhooksRouter)
app.use('/metrics', metricsRouter)
app.use('/repos', kanbanRouter)

const port = process.env.PORT || 3000

// Inicializar recursos asíncronos (colas, redis, etc.)
let server: any = null
// In serverless environments (like Vercel) avoid starting long-lived connections.
// Vercel sets process.env.VERCEL= '1' during runtime.
if (process.env.VERCEL) {
  server = app.listen(port, () => {
    console.log(`GitSpy API listening on port ${port} (serverless mode)`) 
  })
} else {
  // Start queue connection but do not start the worker inside the HTTP server process
  initQueue({ startWorker: false }).then(() => {
    server = app.listen(port, () => {
      console.log(`GitSpy API listening on port ${port}`)
    })
  }).catch(err => {
    console.error('Failed to initialize queue:', err)
    process.exit(1)
  })
}

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
