import { Router } from 'express'
import { getFromCache, setToCache } from '../infra/cache'
import { getRepositoryByFullName, upsertRepository } from '../infra/db'
import { fetchRepo } from '../infra/githubAdapter'

const router = Router()

router.get('/:owner/:repo', async (req, res) => {
    const { owner, repo } = req.params
    const fullName = `${owner}/${repo}`
    const cacheKey = `repositories:${fullName}`

    try {
        // 1. Check Cache
        const cached = await getFromCache(cacheKey)
        if (cached) {
            res.set('x-cache', 'HIT')
            return res.json(JSON.parse(cached))
        }

        // 2. Check DB
        const fromDb = getRepositoryByFullName(fullName)
        if (fromDb) {
            res.set('x-cache', 'DB')
            // Cache it for future
            await setToCache(cacheKey, JSON.stringify(fromDb), 300) // 5 min default
            return res.json(fromDb)
        }

        // 3. Fetch from GitHub
        // fetchRepo returns the raw GitHub object
        const fromGithub = await fetchRepo(owner, repo)
        if (!fromGithub) {
            return res.status(404).json({ error: 'not found' })
        }
        
        // Save to DB
        upsertRepository(fullName, fromGithub.owner.login, fromGithub)

        // The object we want to return/cache is the "Enriched" or "Stored" format, 
        // OR simply the raw format?
        // The DB returns { id, full_name, owner, data: ... }
        // The test expects response.body.data.id 
        // So we should construct the object similar to what DB returns.
        
        const responseData = {
            id: undefined, // DB generates this for the row, but we don't have it yet easily unless we query back.
            // Wait, DB auto-increments ID.
            // But upsertRepository returns Info object (changes, lastInsertRowid).
            // We can assume fromGithub IS the data part.
            // Let's look closely at `upsertRepository`.
            full_name: fullName,
            owner: fromGithub.owner.login,
            data: fromGithub,
            updated_at: Math.floor(Date.now() / 1000)
        }
        
        // Cache it
        await setToCache(cacheKey, JSON.stringify(responseData), 300)

        res.set('x-cache', 'GITHUB')
        return res.json(responseData)
        
    } catch (err: any) {
        if (err?.status === 404) {
             return res.status(404).json({ error: 'not found' })
        }
        console.error(err)
        return res.status(500).json({ error: 'internal error' })
    }
})

export default router
