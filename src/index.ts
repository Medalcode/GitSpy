import express from 'express'
import { config } from './config'
import webhooksRouter from './routes/webhooks'
import repositoriesRouter from './routes/repositories'
import kanbanRouter from './routes/kanban'

const app = express()

app.use(express.json()) // Global JSON parsing

// Mount routes
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
