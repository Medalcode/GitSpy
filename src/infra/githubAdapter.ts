import { Octokit } from 'octokit'
import { config } from '../config'
import { updateFromHeaders, waitForAllowance, backoffUntilReset } from './rateLimiter'

let octokit: Octokit | null = null

export function getOctokit() {
  if (octokit) return octokit
  if (!config.githubToken) {
    console.warn('GITHUB_TOKEN not set; GitHub calls will be disabled')
    return null
  }
  octokit = new Octokit({ auth: config.githubToken })
  return octokit
}

async function requestWithRateLimit<T>(fn: (c: Octokit) => Promise<any>) {
  const client = getOctokit()
  if (!client) return null

  let attempt = 0
  while (attempt < 5) {
    try {
      // wait for allowance before making a call
      await waitForAllowance(1)
      const res = await fn(client)
      // update rate limiter from headers when available
      if (res && res.headers) updateFromHeaders(res.headers as Record<string, any>)
      return res.data ?? res
    } catch (err: any) {
        if (err == null) {
          // Treat null/undefined errors as real errors and fail fast
          throw new Error('Unknown error')
        }
      const status = err?.status ?? err?.statusCode
      const headers = err?.response?.headers ?? err?.headers
      if (headers) updateFromHeaders(headers as Record<string, any>)

      // If rate limit exceeded, wait until reset/backoff
      if (status === 403 || (headers && headers['x-ratelimit-remaining'] === '0')) {
        await backoffUntilReset(attempt)
        attempt++
        continue
      }

      // Other errors: rethrow after some attempts
      if (attempt >= 4) {
        console.error('GitHub request failed after retries', err)
        throw err
      }
      await backoffUntilReset(attempt)
      attempt++
    }
  }
  return null
}

// Example wrapper: fetch repository info (encapsula la API y respeta rate limits)
export async function fetchRepo(owner: string, repo: string) {
  return requestWithRateLimit((client) =>
    client.request('GET /repos/{owner}/{repo}', { owner, repo })
  )
}

