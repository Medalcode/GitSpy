export default class InMemoryDB {
  private repos: Map<string, any> = new Map()
  private events: any[] = []
  private idCounter = 1

  exec(_sql: string) {
    // No-op for CREATE TABLE statements
  }

  prepare(sql: string) {
    const s = sql.trim().toUpperCase()
    if (s.startsWith("SELECT NAME FROM SQLITE_MASTER")) {
      return {
        get: (arg?: any) => {
          if ((sql as string).includes("name='repositories'")) return { name: 'repositories' }
          if ((sql as string).includes("name='events'")) return { name: 'events' }
          return null
        }
      }
    }

    if (s.startsWith('INSERT INTO REPOSITORIES')) {
      return {
        run: (params: any) => {
          const full_name = (params && (params.full_name ?? params[0]))
          const owner = (params && (Object.prototype.hasOwnProperty.call(params, 'owner') ? params.owner : params[1]))
          const data = (params && (params.data ?? params[2]))
          const updated_at = (params && (params.updated_at ?? params[3]))
          const row = { id: this.idCounter++, full_name, owner: owner ?? null, data, updated_at }
          this.repos.set(full_name, row)
          return { changes: 1 }
        }
      }
    }

    if (s.startsWith("SELECT * FROM REPOSITORIES WHERE FULL_NAME")) {
      return {
        get: (fullName: string) => {
          const r = this.repos.get(fullName)
          if (!r) return null
          return { ...r }
        }
      }
    }

    if (s.startsWith('SELECT UPDATED_AT FROM REPOSITORIES')) {
      return { get: (fullName: string) => {
        const r = this.repos.get(fullName)
        return r ? { updated_at: r.updated_at } : null
      } }
    }

    if (s.startsWith('INSERT INTO EVENTS')) {
      return {
        run: (_eventType: any, payload: any, created_at: any) => {
          const row = { id: this.idCounter++, event_type: _eventType, payload, created_at }
          this.events.push(row)
          return { changes: 1 }
        }
      }
    }

    if (s.startsWith('SELECT CREATED_AT FROM EVENTS')) {
      return { get: () => {
        const last = this.events[this.events.length - 1]
        return last ? { created_at: last.created_at } : null
      } }
    }

    if (s.startsWith('SELECT COUNT(*)')) {
      return { get: () => ({ count: this.events.length }) }
    }

    if (s.includes('SELECT PAYLOAD FROM EVENTS')) {
      return { get: () => {
        const last = this.events[this.events.length - 1]
        return last ? { payload: last.payload } : null
      } }
    }

    if (s.includes('SELECT DISTINCT EVENT_TYPE FROM EVENTS')) {
      return { all: () => {
        const types = Array.from(new Set(this.events.map(e => e.event_type)))
        return types.map(t => ({ event_type: t }))
      } }
    }

    // Generic fallback
    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0 })
    }
  }

  close() { this.repos.clear(); this.events = [] }
}
