#!/usr/bin/env node
/*
  replay_events.js

  Replay historical events stored in SQLite `events` table and reconstruct
  deterministic Kanban boards per repository.

  Features:
  - Reads events from DB ordered by `created_at` (or id)
  - Applies handler versions (currently: v1)
  - Idempotence: computes stable event_id and skips duplicates during replay
  - Dry-run mode (no writes) and live mode (writes kanban JSON outputs)

  Usage:
    node scripts/replay_events.js [--from=TIMESTAMP] [--to=TIMESTAMP] [--repo=owner/repo] [--out=outdir] [--handler=v1] [--dry-run]

  Environment:
    SQLITE_PATH - path to sqlite DB (default: ./data/gitspy.sqlite)

*/

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (const a of args) {
    if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--from=')) out.from = Number(a.split('=')[1])
    else if (a.startsWith('--to=')) out.to = Number(a.split('=')[1])
    else if (a.startsWith('--repo=')) out.repo = a.split('=')[1]
    else if (a.startsWith('--out=')) out.out = a.split('=')[1]
    else if (a.startsWith('--handler=')) out.handler = a.split('=')[1]
  }
  out.out = out.out || path.join(process.cwd(), 'replay-output')
  out.handler = out.handler || 'v1'
  return out
}

function loadSqlite(dbPath) {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })
    return db
  } catch (e) {
    console.error('better-sqlite3 is required to read the DB. Install optional dependency better-sqlite3')
    process.exit(1)
  }
}

function getEvents(db, from, to, repoFilter) {
  let q = 'SELECT id, event_type, payload, created_at FROM events'
  const where = []
  const params = []
  if (from) { where.push('created_at >= ?'); params.push(from) }
  if (to) { where.push('created_at <= ?'); params.push(to) }
  if (where.length) q += ' WHERE ' + where.join(' AND ')
  q += ' ORDER BY id ASC'
  const stmt = db.prepare(q)
  const rows = stmt.all(...params)
  // parse payload JSON
  return rows.map(r => ({ id: r.id, event_type: r.event_type, payload: (() => { try { return JSON.parse(r.payload) } catch (e) { return r.payload } })(), created_at: r.created_at }))
}

function computeEventId(evt) {
  if (!evt) return null
  if (evt.payload && evt.payload.event_id) return String(evt.payload.event_id)
  // look for common ids
  if (evt.payload && evt.payload.id) return String(evt.payload.id)
  if (evt.payload && evt.payload.hook_id) return String(evt.payload.hook_id)
  if (evt.payload && evt.payload.delivery) return String(evt.payload.delivery)
  // fallback deterministic hash
  const h = crypto.createHash('sha256')
  h.update((evt.event_type || '') + '|' + JSON.stringify(evt.payload || {}))
  return h.digest('hex')
}

// Handler v1: minimal rules to reconstruct a Kanban based on issue events
function applyEventV1(boardState, evt) {
  // boardState: { cards: Map(cardId->card) }
  const et = evt.event_type
  const p = evt.payload || {}
  // find repository full_name
  const repo = p.repository?.full_name || p.repo_full_name || null
  if (!repo) return // not tied to a repo
  if (!boardState[repo]) boardState[repo] = { cards: {} }
  const state = boardState[repo]

  // Helper to upsert issue card
  function upsertIssue(issue) {
    const id = `issue-${issue.number}`
    const card = state.cards[id] || { id, title: issue.title || `#${issue.number}`, source: 'issue', number: issue.number }
    // determine status
    if (issue.state === 'closed') card.state = 'done'
    else {
      const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name)
      if (labels.map(x => x.toLowerCase()).includes('in-progress') || labels.map(x => x.toLowerCase()).includes('doing')) card.state = 'in_progress'
      else if (labels.map(x => x.toLowerCase()).includes('done')) card.state = 'done'
      else card.state = card.state || 'backlog'
    }
    card.updated_at = Date.now()
    state.cards[id] = card
  }

  if (et === 'issues') {
    const action = p.action
    const issue = p.issue
    if (!issue) return
    if (action === 'opened' || action === 'reopened' || action === 'edited' || action === 'labeled' || action === 'unlabeled') {
      upsertIssue(issue)
    } else if (action === 'closed') {
      upsertIssue(issue)
      const id = `issue-${issue.number}`
      state.cards[id].state = 'done'
    }
    return
  }

  // snapshot payload: apply entire kanban snapshot (overwrites)
  if (et === 'kanban:snapshot' || et === 'snapshot') {
    const snapshot = p.kanban || p.snapshot
    if (snapshot && snapshot.cards) {
      // deterministic: overwrite state
      state.cards = {}
      for (const c of snapshot.cards) {
        const id = c.id || (`card-${crypto.createHash('sha1').update(c.title).digest('hex').slice(0,8)}`)
        state.cards[id] = Object.assign({}, c)
      }
    }
    return
  }

  // other events: push/repository/ping - no-op for kanban in v1
}

function writeBoardsToDisk(state, outDir, dryRun) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const boards = {}
  for (const repo of Object.keys(state)) {
    const board = state[repo]
    // normalize to lists
    const backlog = [], in_progress = [], done = []
    for (const cid of Object.keys(board.cards)) {
      const c = board.cards[cid]
      const item = { id: c.id, title: c.title, state: c.state, meta: { number: c.number } }
      if (c.state === 'done') done.push(item)
      else if (c.state === 'in_progress') in_progress.push(item)
      else backlog.push(item)
    }
    const out = { repo, backlog, in_progress, done }
    boards[repo] = out
    const outPath = path.join(outDir, `${repo.replace(/[\/]/g,'_')}.kanban.json`)
    if (!dryRun) fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
  }
  return boards
}

async function main() {
  const args = parseArgs()
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'gitspy.sqlite')
  const db = loadSqlite(dbPath)
  const events = getEvents(db, args.from, args.to, args.repo)
  console.log('Loaded', events.length, 'events from DB')

  const handler = args.handler || 'v1'
  if (handler !== 'v1') {
    console.error('Unsupported handler version:', handler)
    process.exit(1)
  }

  const processed = new Set()
  const state = {}
  let applied = 0
  for (const e of events) {
    // optional repo filter: skip events that don't match
    const p = e.payload || {}
    const repo = p.repository?.full_name || p.repo_full_name || null
    if (args.repo && repo !== args.repo) continue

    const eid = computeEventId(e)
    if (processed.has(eid)) continue

    // Idempotence: ensure we don't reapply same event in the same run
    // Replay uses per-run processed set; external persistence not required for deterministic reconstruction
    processed.add(eid)

    // Apply handler
    if (handler === 'v1') applyEventV1(state, e)
    applied++
  }

  console.log('Applied', applied, 'events')
  if (args.dryRun) {
    console.log('Dry-run mode: not writing outputs')
  }

  const boards = writeBoardsToDisk(state, args.out, args.dryRun)
  console.log('Wrote boards for', Object.keys(boards).length, 'repos to', args.out)
}

main().catch(e => { console.error(e); process.exit(1) })
