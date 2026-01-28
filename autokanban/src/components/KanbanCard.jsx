import React from 'react'

export default function KanbanCard({ item }) {
  const tags = (item.metadata && item.metadata.tags) || []
  return (
    <div className={`kanban-card ${item.flags && item.flags.done ? 'done' : ''}`}>
      <div className="card-title">{item.title}</div>
      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <div className="card-meta">
        {item.metadata && item.metadata.owner && <span className="owner">{item.metadata.owner}</span>}
        {item.timestamps && item.timestamps.dueDate && <span className="due">Due: {item.timestamps.dueDate}</span>}
      </div>
    </div>
  )
}
