import express from 'express'
import { getKanbanForRepo } from '../services/kanbanService'

const router = express.Router()

// Mounted at /repos
// GET /repos/:owner/:repo/kanban
router.get('/:owner/:repo/kanban', async (req, res) => {
  const { owner, repo } = req.params
  const ifNoneMatch = req.header('if-none-match') || undefined

  try {
    const result = await getKanbanForRepo(owner, repo, { ifNoneMatch })
    if (result.status === 304) {
      if (result.etag) res.set('ETag', result.etag)
      return res.status(304).end()
    }
    if (result.status === 404) return res.status(404).json({ error: 'repo_or_file_not_found' })
    if (result.status === 429) return res.status(429).json({ error: 'rate_limited', reason: result.reason })
    if (result.status === 500) return res.status(500).json({ error: 'internal_error' })

    // success
    if (result.etag) res.set('ETag', result.etag)
    const meta = { cached: !!result.cached, fetchedAt: result.fetchedAt || new Date().toISOString() }
    return res.status(200).json({ repo: `${owner}/${repo}`, kanban: result.kanban, meta })
  } catch (err) {
    console.error('GET /repos/:owner/:repo/kanban error', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
