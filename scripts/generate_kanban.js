#!/usr/bin/env node
/*
  generate_kanban.js

  - Parses Bitacora.md for checklist items and simple tasks
  - Optionally merges GitHub issues if GITHUB_TOKEN and GITHUB_REPO (owner/repo) are set
  - Produces ROADMAP_KANBAN.md (three columns: Backlog / En Progreso / Hecho)
  - Produces kanban.json (structured data)

  Usage:
    node scripts/generate_kanban.js

  Environment (optional):
    GITHUB_TOKEN - token with `repo` or `public_repo` access
    GITHUB_REPO  - owner/repo string (e.g. medalcode/GitSpy)

  Notes:
    - The script is intentionally simple and conservative: it will not mutate
      GitHub resources. It only reads issues to enrich the board when configured.
*/

const fs = require('fs')
const path = require('path')

async function tryRequireOctokit() {
  try {
    const { Octokit } = require('octokit')
    return Octokit
  } catch (e) {
    return null
  }
}

function parseBitacora(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const tasks = []

  // Match markdown checklist items: - [ ] task or - [x] task
  const checkboxRe = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/
  // Fallback: plain list items
  const listRe = /^\s*[-*+]\s+(?!#)(.+)$/

  lines.forEach((line, idx) => {
    let m = line.match(checkboxRe)
    if (m) {
      const checked = (m[1].toLowerCase() === 'x')
      let text = m[2].trim()
      const state = checked ? 'done' : (/(en progreso|in progress|progress)/i.test(text) ? 'in_progress' : 'backlog')
      tasks.push({ source: 'bitacora', line: idx+1, raw: line.trim(), title: text, state })
      return
    }
    m = line.match(listRe)
    if (m) {
      const text = m[1].trim()
      // Skip headings or code fences
      if (text.length > 0 && text.length < 200) {
        const state = (/(en progreso|in progress|progress)/i.test(text) ? 'in_progress' : 'backlog')
        tasks.push({ source: 'bitacora', line: idx+1, raw: line.trim(), title: text, state })
      }
    }
  })

  // Deduplicate by title (simple)
  const seen = new Map()
  const out = []
  for (const t of tasks) {
    const k = t.title.toLowerCase()
    if (!seen.has(k)) { seen.set(k, true); out.push(t) }
  }
  return out
}

async function fetchGithubIssues(owner, repo, token) {
  const Octokit = await tryRequireOctokit()
  if (!Octokit) {
    console.warn('Octokit not available; skipping GitHub issues enrichment')
    return []
  }
  const oct = new Octokit({ auth: token })
  const issues = []
  // We'll fetch open and closed issues (first page only, keep it simple)
  try {
    const resOpen = await oct.request('GET /repos/{owner}/{repo}/issues', { owner, repo, state: 'open', per_page: 100 })
    for (const i of resOpen.data) {
      // Skip PRs
      if (i.pull_request) continue
      issues.push({ id: i.number, title: i.title, url: i.html_url, state: i.state, labels: i.labels.map(l => (typeof l === 'string' ? l : l.name)), source: 'github' })
    }
    const resClosed = await oct.request('GET /repos/{owner}/{repo}/issues', { owner, repo, state: 'closed', per_page: 100 })
    for (const i of resClosed.data) {
      if (i.pull_request) continue
      issues.push({ id: i.number, title: i.title, url: i.html_url, state: i.state, labels: i.labels.map(l => (typeof l === 'string' ? l : l.name)), source: 'github' })
    }
  } catch (e) {
    console.warn('Failed to fetch issues from GitHub', e.message || e)
  }
  return issues
}

function mergeTasks(bitacoraTasks, ghIssues) {
  const cards = []
  // From GitHub issues, map label to state: backlog/in_progress/done
  for (const i of ghIssues) {
    let state = 'backlog'
    const labels = (i.labels || []).map(s => (s||'').toLowerCase())
    if (labels.includes('done') || i.state === 'closed') state = 'done'
    else if (labels.includes('in-progress') || labels.includes('in progress') || labels.includes('doing')) state = 'in_progress'
    cards.push({ id: `gh-${i.id}`, title: i.title, source: 'github', url: i.url, state, meta: { labels: i.labels } })
  }

  // From bitacora tasks
  for (const t of bitacoraTasks) {
    cards.push({ id: `b-${t.line}`, title: t.title, source: 'bitacora', line: t.line, state: t.state })
  }

  // Simple dedupe: prefer GitHub over Bitacora when titles match
  const seen = new Map()
  const out = []
  for (const c of cards) {
    const k = c.title.trim().toLowerCase()
    if (seen.has(k)) {
      const prev = seen.get(k)
      // prefer github card
      if (prev.source === 'bitacora' && c.source === 'github') {
        // replace
        const idx = out.indexOf(prev)
        out[idx] = c
        seen.set(k, c)
      }
    } else { out.push(c); seen.set(k, c) }
  }
  return out
}

function groupCards(cards) {
  const backlog = cards.filter(c => c.state === 'backlog')
  const inProgress = cards.filter(c => c.state === 'in_progress')
  const done = cards.filter(c => c.state === 'done')
  return { backlog, inProgress, done }
}

function writeMarkdownBoard(groups, outPath) {
  const lines = []
  lines.push('# Roadmap Kanban (auto-generated)')
  lines.push('')
  lines.push('## Backlog')
  lines.push('')
  for (const c of groups.backlog) {
    lines.push(`- [ ] ${c.title} ${c.source==='github' ? `([issue](${c.url}))` : `(src:${c.source}${c.line?` line:${c.line}`:''})`}`)
  }
  lines.push('')
  lines.push('## En Progreso')
  lines.push('')
  for (const c of groups.inProgress) {
    lines.push(`- [~] ${c.title} ${c.source==='github' ? `([issue](${c.url}))` : `(src:${c.source}${c.line?` line:${c.line}`:''})`}`)
  }
  lines.push('')
  lines.push('## Hecho')
  lines.push('')
  for (const c of groups.done) {
    lines.push(`- [x] ${c.title} ${c.source==='github' ? `([issue](${c.url}))` : `(src:${c.source}${c.line?` line:${c.line}`:''})`}`)
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
}

function writeJson(cards, outPath) {
  fs.writeFileSync(outPath, JSON.stringify(cards, null, 2), 'utf8')
}

async function main() {
  const repoDir = process.cwd()
  const bitacoraPath = path.join(repoDir, 'Bitacora.md')
  if (!fs.existsSync(bitacoraPath)) {
    console.error('Bitacora.md not found in repository root')
    process.exit(1)
  }

  const bitacoraTasks = parseBitacora(bitacoraPath)

  const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN
  const ghRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPO
  let ghIssues = []
  if (ghToken && ghRepo) {
    const [owner, repo] = ghRepo.split('/')
    if (owner && repo) ghIssues = await fetchGithubIssues(owner, repo, ghToken)
  }

  const cards = mergeTasks(bitacoraTasks, ghIssues)
  const groups = groupCards(cards)

  const outMd = path.join(repoDir, 'ROADMAP_KANBAN.md')
  const outJson = path.join(repoDir, 'kanban.json')
  writeMarkdownBoard(groups, outMd)
  writeJson(cards, outJson)

  console.log('Generated', outMd, 'and', outJson)
}

main().catch(e => { console.error(e); process.exit(1) })
