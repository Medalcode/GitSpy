import IORedis from 'ioredis'
import { config } from '../config'

let client: IORedis.Redis | null = null

export function getRedis() {
  if (client) return client
  client = new IORedis(config.redisUrl)
  client.on('error', (e) => console.error('Redis error', e))
  return client
}

export async function getFromCache(key: string) {
  const r = getRedis()
  return r.get(key)
}

export async function setToCache(key: string, value: string, ttlSeconds = 300) {
  const r = getRedis()
  await r.set(key, value, 'EX', ttlSeconds)
}

export async function delCache(key: string) {
  const r = getRedis()
  await r.del(key)
}

export async function delByPattern(pattern: string) {
  const r = getRedis()
  return new Promise<void>((resolve, reject) => {
    try {
      const stream = r.scanStream({ match: pattern, count: 100 })
      const pipeline = r.pipeline()
      let found = false
      stream.on('data', (keys: string[]) => {
        if (keys.length) {
          found = true
          for (const k of keys) pipeline.del(k)
        }
      })
      stream.on('end', async () => {
        try {
          if (found) await pipeline.exec()
          resolve()
        } catch (e) {
          reject(e)
        }
      })
      stream.on('error', (err) => reject(err))
    } catch (e) {
      reject(e)
    }
  })
}

export async function closeRedis() {
  const r = getRedis()
  try {
    await r.quit()
  } catch (e) {
    try { r.disconnect() } catch (e) { /* ignore */ }
  }
}
