import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const DB_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = process.env.SQLITE_PATH || path.join(DB_DIR, 'gitspy.sqlite')

let db: any = null

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
}

function loadSqlite() {
  // Lazy require so project can run without sqlite if not needed
  try {
    // Use createRequire to support ESM runtime when package.json has "type":"module"
    const require = createRequire(import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('better-sqlite3')
    // support both CommonJS and ES module default export shapes
    const Database = (mod && mod.default) ? mod.default : mod
    return Database
  } catch (e) {
    console.warn('better-sqlite3 not installed; persistence disabled')
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
  return info
}

export function closeDb() {
  if (db) {
    try { db.close() } catch (e) { /* ignore */ }
    db = null
  }
}
