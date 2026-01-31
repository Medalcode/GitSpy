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

// Fetch a file content from repository root path (contents API)
export async function fetchFile(owner: string, repo: string, path: string, ref?: string) {
  return requestWithRateLimit((client) =>
    client.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path, ref })
  )
}

// Fetch all issues (open and closed) for a repo and map to simplified objects
export async function fetchIssues(owner: string, repo: string) {
  const perPage = 100
  let page = 1
  const results: Array<any> = []

  while (true) {
    const data = await requestWithRateLimit((client) =>
      client.rest.issues.listForRepo({ owner, repo, state: 'all', per_page: perPage, page })
    )

    if (!data) break

    // data is an array of issues for this page
    if (!Array.isArray(data)) break

    for (const issue of data) {
      const labels = Array.isArray(issue.labels)
        ? issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name)).filter(Boolean)
        : []

      // determine column based on labels or state
      const statusLabel = labels.find((n: string) => typeof n === 'string' && n.toLowerCase().startsWith('status:'))
      let column = 'Todo'
      if (issue.state === 'closed' || (statusLabel && statusLabel.toLowerCase() === 'status:done')) {
        column = 'Done'
      } else if (statusLabel && statusLabel.toLowerCase() === 'status:in-progress') {
        column = 'In Progress'
      } else if (statusLabel && statusLabel.toLowerCase() === 'status:todo') {
        column = 'Todo'
      }

      results.push({
        id: issue.id ?? issue.number,
        title: issue.title,
        description: issue.body ?? '',
        tags: labels,
        updatedAt: issue.updated_at ?? issue.updatedAt,
        html_url: issue.html_url,
        assignee: issue.assignee ? { login: issue.assignee.login, avatar_url: issue.assignee.avatar_url } : null,
        column,
      })
    }

    if (data.length < perPage) break
    page++
  }

  return results
}

