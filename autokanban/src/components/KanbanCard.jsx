import React from 'react'

function getTagColor(tag) {
  const t = tag.toLowerCase()
  if (t.includes('bug') || t.includes('critical')) return '#ef4444' // red
  if (t.includes('feature') || t.includes('enhancement')) return '#10b981' // green
  if (t.includes('doc')) return '#3b82f6' // blue
  if (t.includes('wip') || t.includes('progress')) return '#f59e0b' // yellow
  return '#6b7280' // gray
}

export default function KanbanCard({ item }) {
  // Support both old Bitacora format and new GitHub Issues format
  const tags = item.tags || (item.metadata && item.metadata.tags) || []
  const owner = item.assignee ? item.assignee.login : (item.metadata && item.metadata.owner)
  const avatarUrl = item.assignee ? item.assignee.avatar_url : null
  const url = item.url // Direct GitHub Local
  
  return (
    <div className={`kanban-card ${item.flags && item.flags.done ? 'done' : ''}`}>
      <div className="card-header">
        <div className="card-title">{item.title}</div>
        {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="github-link" title="Open in GitHub">
              ↗
            </a>
        )}
      </div>

      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map(t => (
            <span key={t} className="tag" style={{ backgroundColor: getTagColor(t) }}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="card-meta">
        <div className="meta-left">
           {item.timestamps && item.timestamps.dueDate && <span className="due">Due: {item.timestamps.dueDate}</span>}
        </div>
        
        {owner && (
          <div className="meta-right owner-info" title={owner}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={owner} className="avatar" />
            ) : (
              <span className="owner-text">{owner}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
