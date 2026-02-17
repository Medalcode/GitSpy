import React from 'react'
import KanbanCard from './KanbanCard'

export default function KanbanColumn({ title, items = [] }) {
  return (
    <div className="kanban-column">
      <h3>{title} <span className="count">{items.length}</span></h3>
      <div className="column-body">
        {items.length === 0 && <div className="empty">Sin items</div>}
        {items.map(item => <KanbanCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}
