import Redis from 'ioredis'
import { config } from '../config'

// use a permissive type to avoid strict runtime/compile-time mismatches
let client: any = null

export function getRedis(): any {
  if (client) return client
  client = new Redis(config.redisUrl)
  client.on('error', (e: any) => console.error('Redis error', e))
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
      const stream: any = r.scanStream({ match: pattern, count: 100 })
      const pipeline: any = r.pipeline()
      let found = false
      stream.on('data', (keys: any[]) => {
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
      stream.on('error', (err: any) => reject(err))
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
