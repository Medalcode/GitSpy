import React, { useState } from 'react'
import { fetchKanban } from './services/api'
import KanbanBoard from './components/KanbanBoard'

export default function App() {
  const [repoInput, setRepoInput] = useState('medalcode/GitSpy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [kanban, setKanban] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    setKanban(null)
    const parts = repoInput.split('/').map(s => s.trim())
    if (parts.length !== 2) {
      setError('Use owner/repo format')
      setLoading(false)
      return
    }
    try {
      const data = await fetchKanban(parts[0], parts[1])
      setKanban(data.kanban || data)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>GitSpy Kanban</h1>
      </header>
      <section className="controls">
        <input value={repoInput} onChange={e => setRepoInput(e.target.value)} placeholder="owner/repo" />
        <button onClick={load} disabled={loading}>Cargar Kanban</button>
      </section>

      <main>
        {loading && <div className="status">Loading…</div>}
        {error && <div className="status error">Error: {error}</div>}
        {!loading && !error && kanban && (
          <KanbanBoard kanban={kanban} />
        )}
        {!loading && !error && !kanban && (
          <div className="status">Ingresa un repositorio y pulsa "Cargar Kanban"</div>
        )}
      </main>
    </div>
  )
}
