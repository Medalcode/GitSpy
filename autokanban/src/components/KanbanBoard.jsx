import React from 'react'
import KanbanColumn from './KanbanColumn'

const order = [ ['pending','🟡 Pendiente'], ['in_progress','🔵 En Desarrollo'], ['completed','🟢 Completadas'] ]

export default function KanbanBoard({ kanban }) {
  if (!kanban || !kanban.states) return <div>No data</div>

  const featuresById = new Map((kanban.features || []).map(f => [f.id, f]))

  return (
    <div className="kanban">
      {order.map(([key, title]) => (
        <KanbanColumn key={key} title={title} items={(kanban.states[key] || []).map(id => featuresById.get(id)).filter(Boolean)} />
      ))}
    </div>
  )
}
