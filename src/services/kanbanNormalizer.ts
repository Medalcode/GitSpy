// Normaliza un array de issues (GitHub) al formato que consume AutoKanban
export interface NormalizedCard {
  id: string
  title: string
  desc: string
}

export interface NormalizedKanban {
  repo: string
  kanban: {
    todo: NormalizedCard[]
    in_progress: NormalizedCard[]
    done: NormalizedCard[]
  }
  meta: {
    source: string
    lastSync: string
  }
}

function normalizeColumnName(col: string) {
  const c = String(col).toLowerCase()
  if (c === 'done' || c === 'status:done') return 'done'
  if (c === 'in progress' || c === 'status:in-progress' || c === 'status:in_progress') return 'in_progress'
  return 'todo'
}

function extractLabels(issue: any): string[] {
  if (Array.isArray(issue.tags)) return issue.tags.map(String)
  if (Array.isArray(issue.labels)) return issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name))
  return []
}

function determineColumn(issue: any) {
  if (issue.column) return normalizeColumnName(issue.column)
  const labels = extractLabels(issue).map((s) => String(s).toLowerCase())
  const status = labels.find((l) => l.startsWith('status:'))
  if (issue.state === 'closed' || status === 'status:done') return 'done'
  if (status === 'status:in-progress') return 'in_progress'
  if (status === 'status:todo') return 'todo'
  return 'todo'
}

export function normalizeIssues(owner: string, repo: string, issues: any[]): NormalizedKanban {
  const repoKey = `${owner}/${repo}`

  // Deduplicate by issue id (use id or number) keeping the most recently updated
  const map = new Map<string, any>()

  for (const raw of issues || []) {
    const id = String(raw.id ?? raw.number ?? raw.key ?? '')
    if (!id) continue
    const updated = raw.updatedAt ?? raw.updated_at ?? ''

    if (!map.has(id)) {
      map.set(id, { raw, updated })
      continue
    }
    const existing = map.get(id)
    const existingUpdated = existing.updated ?? ''
    if (updated && existingUpdated) {
      if (updated > existingUpdated) map.set(id, { raw, updated })
    } else if (updated && !existingUpdated) {
      map.set(id, { raw, updated })
    }
  }

  const todo: NormalizedCard[] = []
  const in_progress: NormalizedCard[] = []
  const done: NormalizedCard[] = []

  let lastSync = ''

  for (const [id, entry] of map.entries()) {
    const issue = entry.raw
    const updated = entry.updated ?? issue.updatedAt ?? issue.updated_at ?? ''
    if (updated && (!lastSync || updated > lastSync)) lastSync = updated

    const column = determineColumn(issue)

    const card: NormalizedCard = {
      id,
      title: String(issue.title ?? ''),
      desc: String(issue.description ?? issue.body ?? ''),
    }

    if (column === 'done') done.push(card)
    else if (column === 'in_progress') in_progress.push(card)
    else todo.push(card)
  }

  // Fallback lastSync to now if none available
  if (!lastSync) lastSync = new Date().toISOString()

  return {
    repo: repoKey,
    kanban: { todo, in_progress, done },
    meta: { source: 'github_issues', lastSync },
  }
}

export default normalizeIssues
