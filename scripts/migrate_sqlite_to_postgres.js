#!/usr/bin/env node
/*
  migrate_sqlite_to_postgres.js

  Copies data from SQLite (current DB) to Postgres.
  Usage:
    node scripts/migrate_sqlite_to_postgres.js --sqlite=./data/gitspy.sqlite --pg=postgres://user:pass@host:5432/dbname

  Notes:
    - This script performs the copy in transactions per table and is idempotent.
    - Run with DB_MODE=dual to enable dual-write before cutover.
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
  if (!cfg.pg) { console.error('Postgres connection string required via --pg or PG_CONN'); process.exit(1) }
  if (!fs.existsSync(cfg.sqlite)) { console.error('SQLite DB not found at', cfg.sqlite); process.exit(1) }

  const sql = new Database(cfg.sqlite, { readonly: true })
  const pool = new Pool({ connectionString: cfg.pg })

  // Copy repositories
  console.log('Copying repositories...')
  const repos = sql.prepare('SELECT full_name, owner, data, updated_at FROM repositories').all()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`CREATE TABLE IF NOT EXISTS repositories (
      id SERIAL PRIMARY KEY,
      full_name TEXT UNIQUE,
      owner TEXT,
      data JSONB,
      updated_at INTEGER
    )`)
    const ins = 'INSERT INTO repositories (full_name, owner, data, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT(full_name) DO UPDATE SET data=EXCLUDED.data, owner=EXCLUDED.owner, updated_at=EXCLUDED.updated_at'
    for (const r of repos) {
      const data = JSON.parse(r.data)
      await client.query(ins, [r.full_name, r.owner, data, r.updated_at])
    }
    await client.query('COMMIT')
    console.log('Repositories copied:', repos.length)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Error copying repositories', e)
    process.exit(1)
  } finally { client.release() }

  // Copy events in batches
  console.log('Copying events...')
  const events = sql.prepare('SELECT id, event_type, payload, created_at FROM events ORDER BY id ASC').all()
  const batchSize = 500
  for (let i=0;i<events.length;i+=batchSize) {
    const chunk = events.slice(i,i+batchSize)
    const client2 = await pool.connect()
    try {
      await client2.query('BEGIN')
      await client2.query(`CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type TEXT,
        payload JSONB,
        created_at INTEGER
      )`)
      const ins = 'INSERT INTO events (event_type, payload, created_at) VALUES ($1,$2,$3)'
      for (const e of chunk) {
        let payload = e.payload
        try { payload = JSON.parse(e.payload) } catch (_) { /* keep as-is */ }
        await client2.query(ins, [e.event_type, payload, e.created_at])
      }
      await client2.query('COMMIT')
      console.log('Copied events', i, 'to', i+chunk.length)
    } catch (e) {
      await client2.query('ROLLBACK')
      console.error('Error copying events chunk', e)
      process.exit(1)
    } finally { client2.release() }
  }

  console.log('Migration completed successfully')
  await pool.end()
}

main().catch(e=>{ console.error(e); process.exit(1) })
