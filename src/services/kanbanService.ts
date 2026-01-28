import { fetchFile } from '../infra/githubAdapter'
import { config } from '../config'
import { parseBitacora } from '../bitacoraParser.js'

type CacheEntry = {
  kanban: any
  etag: string | null
  fetchedAt: string
  expiresAt: number
}

const CACHE_TTL = Number(process.env.KANBAN_CACHE_TTL_SECONDS || 300)
const FETCH_TIMEOUT_MS = Number(process.env.KANBAN_FETCH_TIMEOUT_MS || 10000)

const cache = new Map<string, CacheEntry>()

function nowMs() { return Date.now() }

async function fetchBitacoraFromGitHub(owner: string, repo: string) {
  // defensive timeout
  const p = (async () => {
    const res = await fetchFile(owner, repo, 'Bitacora.md')
    return res
  })()
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT_MS))
  return Promise.race([p, timeout])
}

export async function getKanbanForRepo(owner: string, repo: string, opts: { ifNoneMatch?: string } = {}) {
  const key = `${owner}/${repo}`
  const now = nowMs()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    // conditional
    if (opts.ifNoneMatch && cached.etag && opts.ifNoneMatch === cached.etag) {
      return { status: 304, cached: true, etag: cached.etag }
    }
    return { status: 200, kanban: cached.kanban, cached: true, etag: cached.etag, fetchedAt: cached.fetchedAt }
  }

  // fetch from GitHub
  try {
    const data: any = await fetchBitacoraFromGitHub(owner, repo)
    if (!data) return { status: 404 }

    // GitHub Contents API returns { content, encoding, sha }
    const encoding = data.encoding || 'utf-8'
    let md = ''
    if (data.content) {
      if (encoding === 'base64') {
        md = Buffer.from(data.content, 'base64').toString('utf8')
      } else {
        md = String(data.content)
      }
    } else {
      // empty file
      md = ''
    }

    const kanban = parseBitacora(md)

    const etag = data.sha || null
    const fetchedAt = new Date().toISOString()
    const entry: CacheEntry = { kanban, etag, fetchedAt, expiresAt: now + CACHE_TTL * 1000 }
    cache.set(key, entry)

    // conditional after fetch
    if (opts.ifNoneMatch && etag && opts.ifNoneMatch === etag) {
      return { status: 304, cached: false, etag }
    }

    return { status: 200, kanban, cached: false, etag, fetchedAt }
  } catch (err: any) {
    // Map known errors
    const msg = (err && err.message) ? err.message : String(err)
    if (/Not Found/i.test(msg) || /404/.test(msg)) return { status: 404 }
    if (/rate limit/i.test(msg) || /timeout/i.test(msg)) return { status: 429, reason: msg }
    return { status: 500, reason: msg }
  }
}

export function clearKanbanCache(owner: string, repo: string) {
  cache.delete(`${owner}/${repo}`)
}
