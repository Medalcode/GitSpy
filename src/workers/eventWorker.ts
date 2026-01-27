import { Job } from 'bullmq'
import { fetchRepo } from '../infra/githubAdapter'
import { delCache, delByPattern } from '../infra/cache'
import { saveEvent } from '../infra/db'
import { saveRepositoryFromGitHub } from '../core/repository'

export async function EventWorker(job: Job) {
  const payload = job.data
  const eventType = payload.event || payload.event_type || 'unknown'
  console.log('Processing job', job.id, eventType)

  try {
    // Persistir el evento en la base de datos si está disponible
    try {
      await saveEvent(eventType, payload.payload ?? payload)
    } catch (e) {
      console.warn('Failed to persist event', e)
    }

    // Invalidate repository caches conservatively for repository-related events
    if (eventType === 'push' || eventType === 'repository' || eventType === 'ping') {
      if (payload.payload && payload.payload.repository) {
        const repo = payload.payload.repository
        const key = `repositories:${repo.full_name}`
        try {
          // delete exact key and related page caches
          await delCache(key)
          await delByPattern(`repositories:page:*`)
          // delete any other keys that include the full_name
          await delByPattern(`repositories:*${repo.full_name}*`)
        } catch (e) {
          console.warn('Failed to delete cache key(s) for', key, e)
        }
      }
    }

    // Fetch latest repo info and upsert into DB (respetando rate limits en el adapter)
    if (payload.payload && payload.payload.repository) {
      const owner = payload.payload.repository.owner?.login
      const name = payload.payload.repository.name
      if (owner && name) {
        const gh = await fetchRepo(owner, name)
        if (gh) {
          try {
            await saveRepositoryFromGitHub(gh)
          } catch (e) {
            console.warn('Failed to save repo to DB', e)
          }
        }
      }
    }
  } catch (err) {
    console.error('EventWorker error', err)
    throw err
  }
}

export default EventWorker
