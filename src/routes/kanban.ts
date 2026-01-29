import { Router } from 'express'
import { getKanbanForRepo } from '../services/kanbanService'

const router = Router()

router.get('/repos/:owner/:repo/kanban', async (req, res) => {
  const { owner, repo } = req.params
  const ifNoneMatch = req.headers['if-none-match']

  const result: any = await getKanbanForRepo(owner, repo, { 
    ifNoneMatch: ifNoneMatch as string 
  })

  // set caching headers
  if (result.etag) res.set('ETag', result.etag)
  
  if (result.status === 304) {
    return res.status(304).end()
  }

  if (result.status === 200) {
    return res.json(result.kanban)
  }

  if (result.status === 404) {
    return res.status(404).json({ error: 'Repository or Bitacora.md not found' })
  }

  if (result.status === 429) {
    return res.status(429).json({ error: 'Too many requests or timeout', details: result.reason })
  }

  return res.status(500).json({ error: 'Internal server error', details: result.reason })
})

export default router
