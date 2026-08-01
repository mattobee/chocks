import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { FeatureRow, INDENT_WIDTH } from '@/ui/components/feature-row'
import { StatusBadge } from '@/ui/components/status-badge'
import { projectDrop, rowsExcludingSubtree, type DropProjection, type FlatRow } from '@/lib/tree'
import type { Feature } from '@/lib/types'
import type { StatusDefinition } from '@/lib/status'

export interface FeatureTreeProps {
  rows: FlatRow[]
  statuses: StatusDefinition[]
  matchedIds: ReadonlySet<string>
  filtering: boolean
  onToggle: (id: string) => void
  onRename: (id: string, title: string) => void
  onStatusChange: (id: string, status: string) => void
  onAddChild: (parentId: string) => void
  onEdit: (feature: Feature) => void
  onDelete: (feature: Feature) => void
  onMove: (featureId: string, projection: DropProjection) => void
}

export function FeatureTree({
  rows,
  statuses,
  matchedIds,
  filtering,
  onToggle,
  onRename,
  onStatusChange,
  onAddChild,
  onEdit,
  onDelete,
  onMove,
}: FeatureTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)

  const sensors = useSensors(
    // A small distance threshold keeps clicks on the row controls from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // While dragging, the moved feature's descendants travel with it and must not be
  // droppable targets — projectDrop assumes exactly this list.
  const visibleRows = useMemo(
    () => (activeId ? rowsExcludingSubtree(rows, activeId) : rows),
    [rows, activeId],
  )

  // The hovered row picks the slot, horizontal travel picks the depth. Falling back to the
  // dragged row keeps the projection sane before the first hover event arrives.
  const projection = useMemo(() => {
    if (!activeId) return null
    const overIndex = visibleRows.findIndex((row) => row.feature.id === (overId ?? activeId))
    if (overIndex === -1) return null
    return projectDrop(visibleRows, activeId, overIndex, Math.round(offsetX / INDENT_WIDTH))
  }, [activeId, overId, visibleRows, offsetX])

  const activeFeature = rows.find((row) => row.feature.id === activeId)?.feature

  function reset() {
    setActiveId(null)
    setOverId(null)
    setOffsetX(0)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    setOverId(null)
    setOffsetX(0)
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null)
  }

  function handleDragMove(event: DragMoveEvent) {
    setOffsetX(event.delta.x)
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id)
    // Commit the projection the row was previewing rather than recomputing one, so the
    // drop cannot land at a different depth from the one shown.
    const result = event.over ? projection : null
    reset()
    if (result) onMove(draggedId, result)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext
        items={visibleRows.map((row) => row.feature.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col">
          {visibleRows.map((row) => (
            <FeatureRow
              key={row.feature.id}
              feature={row.feature}
              statuses={statuses}
              // Mid-drag the row previews the depth it would land at.
              depth={activeId === row.feature.id && projection ? projection.depth : row.depth}
              hasChildren={row.hasChildren}
              expanded={row.expanded}
              matched={!filtering || matchedIds.has(row.feature.id)}
              filtering={filtering}
              onToggle={onToggle}
              onRename={onRename}
              onStatusChange={onStatusChange}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeFeature && (
          <div className="bg-background flex items-center gap-2 rounded-md border px-2 py-1 text-sm shadow-lg">
            <span className="truncate">{activeFeature.title}</span>
            <StatusBadge statuses={statuses} status={activeFeature.status} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
