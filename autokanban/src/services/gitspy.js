const API_BASE = import.meta.env.VITE_GITSPY_BASE || 'http://localhost:3000'

export async function fetchKanban(owner, repo) {
  const url = `${API_BASE}/repos/${owner}/${repo}/kanban`
  const res = await fetch(url)
  if (res.status === 404) throw new Error('Repository or Bitacora.md not found (404)')
  if (res.status === 429) throw new Error('Rate limited by GitHub (429)')
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  const json = await res.json()
  // The backend is authoritative; frontend does not interpret rules
  return json
}
