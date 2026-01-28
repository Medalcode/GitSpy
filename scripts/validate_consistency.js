#!/usr/bin/env node
/*
  validate_consistency.js
  Compares counts between SQLite and Postgres to validate migration consistency.
  Usage: node scripts/validate_consistency.js --sqlite=... --pg=...
*/
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const { Pool } = require('pg')

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (const a of args) {
    if (a.startsWith('--sqlite=')) out.sqlite = a.split('=')[1]
    if (a.startsWith('--pg=')) out.pg = a.split('=')[1]
  }
  out.sqlite = out.sqlite || process.env.SQLITE_PATH || path.join(process.cwd(),'data','gitspy.sqlite')
  out.pg = out.pg || process.env.PG_CONN || process.env.PG_CONNECTION_STRING
  return out
}

async function main() {
  const cfg = parseArgs()
  if (!cfg.pg) { console.error('Postgres connection string required'); process.exit(1) }
  if (!fs.existsSync(cfg.sqlite)) { console.error('SQLite DB not found', cfg.sqlite); process.exit(1) }
  const sql = new Database(cfg.sqlite, { readonly: true })
  const pool = new Pool({ connectionString: cfg.pg })

  const sqliteRepoCount = sql.prepare('SELECT COUNT(*) as c FROM repositories').get().c
  const pgRepoCount = (await pool.query('SELECT COUNT(*) as c FROM repositories')).rows[0].c
  const sqliteEventCount = sql.prepare('SELECT COUNT(*) as c FROM events').get().c
  const pgEventCount = (await pool.query('SELECT COUNT(*) as c FROM events')).rows[0].c

  console.log('repositories: sqlite=', sqliteRepoCount, 'postgres=', pgRepoCount)
  console.log('events: sqlite=', sqliteEventCount, 'postgres=', pgEventCount)

  // sample mismatches: find repo full_names in sqlite not in pg
  const missingRepos = []
  const rows = sql.prepare('SELECT full_name FROM repositories').all()
  for (const r of rows) {
    const res = await pool.query('SELECT 1 FROM repositories WHERE full_name = $1 LIMIT 1', [r.full_name])
    if (res.rowCount === 0) missingRepos.push(r.full_name)
  }
  console.log('Missing repos in Postgres (sample up to 20):', missingRepos.slice(0,20))

  await pool.end()
}

main().catch(e=>{ console.error(e); process.exit(1) })
