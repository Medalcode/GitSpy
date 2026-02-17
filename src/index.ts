import express from 'express'
import { config } from './config'
import webhooksRouter from './routes/webhooks'
<<<<<<< HEAD
import metricsRouter from './routes/metrics'
import { initQueue, closeQueue } from './infra/queue'
import { closeDb } from './infra/db'
import { closeRedis } from './infra/cache'
import { getRedis } from './infra/cache'
import { getQueueCounts } from './infra/queue'

dotenv.config()
=======
import repositoriesRouter from './routes/repositories'
import kanbanRouter from './routes/kanban'
>>>>>>> eea7ac3132d8ca1130dbe2cafca1f55a760b9be5

const app = express()

app.use(express.json()) // Global JSON parsing

<<<<<<< HEAD
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
=======
// Mount routes
>>>>>>> eea7ac3132d8ca1130dbe2cafca1f55a760b9be5
app.use('/webhooks', webhooksRouter)
app.use('/repositories', repositoriesRouter)
app.use('/api', kanbanRouter)

app.get('/', (req, res) => {
  res.send({ status: 'ok', version: process.env.npm_package_version })
})

// Start server if main module
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`)
  })
}

export default app
