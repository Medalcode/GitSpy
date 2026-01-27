import express from 'express'
import { getFromCache, setToCache } from '../infra/cache'
import { findRepository, saveRepositoryFromGitHub } from '../core/repository'
import { fetchRepo } from '../infra/githubAdapter'

const router = express.Router()

// GET /repositories?page=1&per_page=20
router.get('/', async (req, res) => {
  const page = Number(req.query.page || 1)
  const perPage = Number(req.query.per_page || 20)
  const cacheKey = `repositories:page:${page}:per:${perPage}`

  const cached = await getFromCache(cacheKey)
  if (cached) {
    res.set('X-Cache', 'HIT')
    return res.json(JSON.parse(cached))
  }

  // Placeholder: devolver lista vacía por ahora
  const result = {
    data: [],
    page,
    perPage
  }

  await setToCache(cacheKey, JSON.stringify(result), 600)
  res.set('X-Cache', 'MISS')
  res.json(result)
})

// GET /repositories/:owner/:repo
router.get('/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params
  const fullName = `${owner}/${repo}`
  const cacheKey = `repositories:${fullName}`

  try {
    const cached = await getFromCache(cacheKey)
    if (cached) {
      res.set('X-Cache', 'HIT')
      return res.json(JSON.parse(cached))
    }

    // Try DB
    const fromDb = await findRepository(fullName)
    if (fromDb) {
      await setToCache(cacheKey, JSON.stringify(fromDb), 300)
      res.set('X-Cache', 'DB')
      return res.json(fromDb)
    }

    // Fallback to GitHub
    const gh = await fetchRepo(owner, repo)
    if (gh) {
      await saveRepositoryFromGitHub(gh)
      const payload = { full_name: gh.full_name || fullName, data: gh }
      await setToCache(cacheKey, JSON.stringify(payload), 300)
      res.set('X-Cache', 'GITHUB')
      return res.json(payload)
    }

    return res.status(404).json({ error: 'not found' })
  } catch (err) {
    console.error('GET /repositories/:owner/:repo error', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
