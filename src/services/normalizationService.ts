export interface KanbanItem {
  id: string | number
  title: string
  desc: string
  tags?: string[]
  updatedAt?: string
  url?: string
  assignee?: { login: string; avatar_url: string }
}

export interface NormalizedKanban {
  repo: string
  kanban: {
    todo: KanbanItem[]
    in_progress: KanbanItem[]
    done: KanbanItem[]
  }
  meta: {
    source: string
    lastSync: string
  }
}

/**
 * Normalizes an array of GitHub issues (from githubAdapter) into the AutoKanban format.
 * 
 * Input Issue Schema from Adapter:
 * {
 *   id: number,
 *   title: string,
 *   description: string,
 *   tags: string[],
 *   updatedAt: string,
 *   html_url: string,
 *   assignee: { login: string, avatar_url: string } | null,
 *   column: 'Todo' | 'In Progress' | 'Done'
 * }
 */
export function normalizeGithubIssues(owner: string, repo: string, issues: any[]): NormalizedKanban {
  const kanban = {
    todo: [] as KanbanItem[],
    in_progress: [] as KanbanItem[],
    done: [] as KanbanItem[],
  }

  for (const issue of issues) {
    const item: KanbanItem = {
      id: issue.id,
      title: issue.title,
      desc: issue.description,
      tags: issue.tags,
      updatedAt: issue.updatedAt,
      url: issue.html_url,
      assignee: issue.assignee,
    }

    // Map adapter columns to requested JSON keys
    switch (issue.column) {
      case 'Todo':
        kanban.todo.push(item)
        break
      case 'In Progress':
        kanban.in_progress.push(item)
        break
      case 'Done':
        kanban.done.push(item)
        break
      default:
        // Default strategy: if uncertain, put in Todo
        kanban.todo.push(item)
    }
  }

  return {
    repo: `${owner}/${repo}`,
    kanban,
    meta: {
      source: 'github_issues',
      lastSync: new Date().toISOString(),
    },
  }
}
