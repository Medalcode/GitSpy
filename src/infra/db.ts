import fs from 'fs'
import path from 'path'
import InMemoryDB from './inMemoryDb'

// Optional Postgres support for progressive migration
let pgPool: any = null
const DB_MODE = process.env.DB_MODE || 'sqlite' // 'sqlite' | 'dual' | 'postgres'
const PG_CONN = process.env.PG_CONN || process.env.PG_CONNECTION_STRING || ''

const DB_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = process.env.SQLITE_PATH || path.join(DB_DIR, 'gitspy.sqlite')

let db: any = null

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
}

function loadSqlite() {
  // Lazy require so project can run without sqlite if not needed
  try {
    // Prefer CommonJS require when available (this covers Jest environment)
    if (typeof require === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('better-sqlite3')
      const Database = (mod && mod.default) ? mod.default : mod
      return Database
    }
    // Fallback: try to use dynamic import of module loader
    // If neither approach works, we'll fall through to the catch block.
  } catch (e) {
    console.warn('better-sqlite3 not installed; using in-memory fallback for tests')
    return InMemoryDB
  }
}

function initPostgresPool() {
  if (!PG_CONN) return null
  if (pgPool) return pgPool
  try {
    // Lazy require so pg is optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg')
    pgPool = new Pool({ connectionString: PG_CONN })
    return pgPool
  } catch (e) {
    console.warn('pg not available or failed to init Postgres pool', (e as any)?.message || e)
    pgPool = null
    return null
  }
}

export function initDb() {
  if (db) return db
  const Database = loadSqlite()
  if (!Database) return null
  ensureDir()
  db = new Database(DB_PATH)

  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT UNIQUE,
      owner TEXT,
      data TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT,
      payload TEXT,
      created_at INTEGER
    );
  `)

  return db
}

// Helper to perform writes to Postgres when running in 'dual' or 'postgres' mode.
async function upsertRepositoryPostgres(fullName: string, owner: string, dataObj: any) {
  const pool = initPostgresPool()
  if (!pool) return null
  const now = Math.floor(Date.now() / 1000)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        full_name TEXT UNIQUE,
        owner TEXT,
        data JSONB,
        updated_at INTEGER
      );
    `)
    const res = await client.query(`INSERT INTO repositories (full_name, owner, data, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(full_name) DO UPDATE SET data = EXCLUDED.data, owner = EXCLUDED.owner, updated_at = EXCLUDED.updated_at
      RETURNING *`, [fullName, owner, dataObj, now])
    await client.query('COMMIT')
    return res.rows[0]
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) { /* ignore */ }
    console.warn('Postgres upsertRepository failed', (e as any)?.message || e)
    return null
  } finally {
    client.release()
  }
}

async function saveEventPostgres(eventType: string, payload: any) {
  const pool = initPostgresPool()
  if (!pool) return null
  const now = Math.floor(Date.now() / 1000)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type TEXT,
        payload JSONB,
        created_at INTEGER
      );
    `)
    const res = await client.query('INSERT INTO events (event_type, payload, created_at) VALUES ($1, $2, $3) RETURNING *', [eventType, payload, now])
    await client.query('COMMIT')
    return res.rows[0]
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) { /* ignore */ }
    console.warn('Postgres saveEvent failed', (e as any)?.message || e)
    return null
  } finally {
    client.release()
  }
}

export function getDb() {
  if (!db) return initDb()
  return db
}

export function upsertRepository(fullName: string, owner: string, dataObj: any) {
  const d = getDb()
  if (!d) return null
  const now = Math.floor(Date.now() / 1000)
  const stmt = d.prepare(`INSERT INTO repositories (full_name, owner, data, updated_at)
    VALUES (@full_name, @owner, @data, @updated_at)
    ON CONFLICT(full_name) DO UPDATE SET data = @data, owner = @owner, updated_at = @updated_at;
  `)
  const info = stmt.run({ full_name: fullName, owner, data: JSON.stringify(dataObj), updated_at: now })
  // Dual-write to Postgres when configured
  if (DB_MODE === 'dual' || DB_MODE === 'postgres') {
    (async () => {
      try { await upsertRepositoryPostgres(fullName, owner, dataObj) } catch (e) { console.warn('dual-write repo failed', e) }
    })()
  }
  return info
}

export function getRepositoryByFullName(fullName: string) {
  const d = getDb()
  if (!d) return null
  const row = d.prepare('SELECT * FROM repositories WHERE full_name = ?').get(fullName)
  if (!row) return null
  return { ...row, data: JSON.parse(row.data) }
}

export function saveEvent(eventType: string, payload: any) {
  const d = getDb()
  if (!d) return null
  const now = Math.floor(Date.now() / 1000)
  const stmt = d.prepare('INSERT INTO events (event_type, payload, created_at) VALUES (?, ?, ?)')
  const info = stmt.run(eventType, JSON.stringify(payload), now)
  // Dual-write to Postgres when configured
  if (DB_MODE === 'dual' || DB_MODE === 'postgres') {
    (async () => {
      try { await saveEventPostgres(eventType, payload) } catch (e) { console.warn('dual-write event failed', e) }
    })()
  }
  return info
}

export function closeDb() {
  if (db) {
    try { db.close() } catch (e) { /* ignore */ }
    db = null
  }
}
