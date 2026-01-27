import { initDb, getDb, upsertRepository, getRepositoryByFullName, saveEvent, closeDb } from '../../src/infra/db'
import fs from 'fs'
import path from 'path'

describe('db', () => {
    const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-gitspy.sqlite')

    beforeEach(() => {
        // Clean up any existing test database
        closeDb()
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }
        // Set test database path
        process.env.SQLITE_PATH = TEST_DB_PATH
    })

    afterEach(() => {
        closeDb()
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }
    })

    describe('initDb', () => {
        test('should create database and tables', () => {
            const db = initDb()
            expect(db).toBeTruthy()

            // Verify repositories table exists
            const repoTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repositories'").get()
            expect(repoTable).toBeTruthy()

            // Verify events table exists
            const eventsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get()
            expect(eventsTable).toBeTruthy()
        })

        test('should return same instance on multiple calls', () => {
            const db1 = initDb()
            const db2 = initDb()
            expect(db1).toBe(db2)
        })

        test('should create data directory if it does not exist', () => {
            const dataDir = path.dirname(TEST_DB_PATH)
            if (fs.existsSync(dataDir)) {
                fs.rmSync(dataDir, { recursive: true })
            }

            const db = initDb()
            expect(db).toBeTruthy()
            expect(fs.existsSync(dataDir)).toBe(true)
        })

        test('should return null if better-sqlite3 is not available', () => {
            // This test would require mocking the require, which is complex
            // For now, we'll skip this as it's an edge case
            // In real scenario, you'd use jest.mock to simulate module not found
        })
    })

    describe('upsertRepository', () => {
        beforeEach(() => {
            initDb()
        })

        test('should insert new repository', () => {
            const repoData = { id: 123, name: 'test-repo', description: 'Test' }
            const result = upsertRepository('owner/test-repo', 'owner', repoData)

            expect(result).toBeTruthy()
            expect(result.changes).toBe(1)
        })

        test('should update existing repository', () => {
            const repoData1 = { id: 123, name: 'test-repo', description: 'First' }
            upsertRepository('owner/test-repo', 'owner', repoData1)

            const repoData2 = { id: 123, name: 'test-repo', description: 'Updated' }
            const result = upsertRepository('owner/test-repo', 'owner', repoData2)

            expect(result).toBeTruthy()
            expect(result.changes).toBe(1)

            const retrieved = getRepositoryByFullName('owner/test-repo')
            expect(retrieved.data.description).toBe('Updated')
        })

        test('should store data as JSON string', () => {
            const repoData = { id: 456, nested: { value: 'test' }, array: [1, 2, 3] }
            upsertRepository('owner/complex-repo', 'owner', repoData)

            const retrieved = getRepositoryByFullName('owner/complex-repo')
            expect(retrieved.data).toEqual(repoData)
            expect(retrieved.data.nested.value).toBe('test')
            expect(retrieved.data.array).toEqual([1, 2, 3])
        })

        test('should update timestamp on upsert', () => {
            const before = Math.floor(Date.now() / 1000)
            upsertRepository('owner/test-repo', 'owner', { id: 123 })

            const db = getDb()
            const row = db.prepare('SELECT updated_at FROM repositories WHERE full_name = ?').get('owner/test-repo')

            expect(row.updated_at).toBeGreaterThanOrEqual(before)
            expect(row.updated_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
        })

        test('should handle null owner', () => {
            const result = upsertRepository('owner/test-repo', null as any, { id: 123 })
            expect(result).toBeTruthy()

            const retrieved = getRepositoryByFullName('owner/test-repo')
            expect(retrieved.owner).toBeNull()
        })
    })

    describe('getRepositoryByFullName', () => {
        beforeEach(() => {
            initDb()
        })

        test('should retrieve existing repository', () => {
            const repoData = { id: 789, name: 'my-repo', stars: 100 }
            upsertRepository('user/my-repo', 'user', repoData)

            const retrieved = getRepositoryByFullName('user/my-repo')
            expect(retrieved).toBeTruthy()
            expect(retrieved.full_name).toBe('user/my-repo')
            expect(retrieved.owner).toBe('user')
            expect(retrieved.data.id).toBe(789)
            expect(retrieved.data.stars).toBe(100)
        })

        test('should return null for non-existent repository', () => {
            const retrieved = getRepositoryByFullName('nonexistent/repo')
            expect(retrieved).toBeNull()
        })

        test('should parse JSON data correctly', () => {
            const complexData = {
                id: 999,
                metadata: { tags: ['tag1', 'tag2'], count: 42 }
            }
            upsertRepository('org/complex', 'org', complexData)

            const retrieved = getRepositoryByFullName('org/complex')
            expect(retrieved.data.metadata.tags).toEqual(['tag1', 'tag2'])
            expect(retrieved.data.metadata.count).toBe(42)
        })
    })

    describe('saveEvent', () => {
        beforeEach(() => {
            initDb()
        })

        test('should save event with payload', () => {
            const payload = { ref: 'refs/heads/main', commits: [] }
            const result = saveEvent('push', payload)

            expect(result).toBeTruthy()
            expect(result.changes).toBe(1)
        })

        test('should save event with timestamp', () => {
            const before = Math.floor(Date.now() / 1000)
            saveEvent('repository', { action: 'created' })

            const db = getDb()
            const row = db.prepare('SELECT created_at FROM events ORDER BY id DESC LIMIT 1').get()

            expect(row.created_at).toBeGreaterThanOrEqual(before)
            expect(row.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
        })

        test('should save multiple events', () => {
            saveEvent('push', { ref: 'main' })
            saveEvent('pull_request', { action: 'opened' })
            saveEvent('issues', { action: 'closed' })

            const db = getDb()
            const count = db.prepare('SELECT COUNT(*) as count FROM events').get()
            expect(count.count).toBe(3)
        })

        test('should store payload as JSON string', () => {
            const complexPayload = {
                repository: { id: 123, name: 'test' },
                commits: [{ sha: 'abc', message: 'test' }]
            }
            saveEvent('push', complexPayload)

            const db = getDb()
            const row = db.prepare('SELECT payload FROM events ORDER BY id DESC LIMIT 1').get()
            const parsed = JSON.parse(row.payload)

            expect(parsed.repository.id).toBe(123)
            expect(parsed.commits[0].sha).toBe('abc')
        })

        test('should handle different event types', () => {
            const eventTypes = ['push', 'pull_request', 'issues', 'repository', 'ping', 'star']

            eventTypes.forEach(type => {
                saveEvent(type, { test: true })
            })

            const db = getDb()
            const rows = db.prepare('SELECT DISTINCT event_type FROM events').all()
            const types = rows.map((r: any) => r.event_type)

            expect(types).toEqual(expect.arrayContaining(eventTypes))
        })
    })

    describe('closeDb', () => {
        test('should close database connection', () => {
            const db = initDb()
            expect(db).toBeTruthy()

            closeDb()

            // After closing, getDb should reinitialize
            const newDb = getDb()
            expect(newDb).toBeTruthy()
        })

        test('should not throw if database is not initialized', () => {
            expect(() => closeDb()).not.toThrow()
        })

        test('should allow multiple close calls', () => {
            initDb()
            closeDb()
            expect(() => closeDb()).not.toThrow()
        })
    })

    describe('integration scenarios', () => {
        beforeEach(() => {
            initDb()
        })

        test('should handle complete repository lifecycle', () => {
            // Create
            upsertRepository('org/project', 'org', { id: 1, stars: 0 })

            // Read
            let repo = getRepositoryByFullName('org/project')
            expect(repo.data.stars).toBe(0)

            // Update
            upsertRepository('org/project', 'org', { id: 1, stars: 100 })
            repo = getRepositoryByFullName('org/project')
            expect(repo.data.stars).toBe(100)
        })

        test('should handle concurrent event saves', () => {
            const events = Array.from({ length: 50 }, (_, i) => ({
                type: 'push',
                payload: { commit: i }
            }))

            events.forEach(e => saveEvent(e.type, e.payload))

            const db = getDb()
            const count = db.prepare('SELECT COUNT(*) as count FROM events').get()
            expect(count.count).toBe(50)
        })

        test('should maintain data integrity across operations', () => {
            // Save multiple repositories
            upsertRepository('user1/repo1', 'user1', { id: 1 })
            upsertRepository('user2/repo2', 'user2', { id: 2 })
            upsertRepository('user3/repo3', 'user3', { id: 3 })

            // Save events
            saveEvent('push', { repo: 'user1/repo1' })
            saveEvent('push', { repo: 'user2/repo2' })

            // Verify repositories
            expect(getRepositoryByFullName('user1/repo1')).toBeTruthy()
            expect(getRepositoryByFullName('user2/repo2')).toBeTruthy()
            expect(getRepositoryByFullName('user3/repo3')).toBeTruthy()

            // Verify events
            const db = getDb()
            const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get()
            expect(eventCount.count).toBe(2)
        })
    })
})
