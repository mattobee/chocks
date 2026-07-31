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
import type { Feature, FeatureStatus } from '@/lib/types'

export interface FeatureTreeProps {
  rows: FlatRow[]
  matchedIds: ReadonlySet<string>
  filtering: boolean
  onToggle: (id: string) => void
  onRename: (id: string, title: string) => void
  onStatusChange: (id: string, status: FeatureStatus) => void
  onAddChild: (parentId: string) => void
  onEdit: (feature: Feature) => void
  onDelete: (feature: Feature) => void
  onMove: (featureId: string, projection: DropProjection) => void
}

export function FeatureTree({
  rows,
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

  const projection = useMemo(() => {
    if (!activeId) return null
    const overIndex = visibleRows.findIndex((row) => row.feature.id === activeId)
    if (overIndex === -1) return null
    return projectDrop(visibleRows, activeId, overIndex, Math.round(offsetX / INDENT_WIDTH))
  }, [activeId, visibleRows, offsetX])

  const activeFeature = rows.find((row) => row.feature.id === activeId)?.feature

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    setOffsetX(0)
  }

  function handleDragMove(event: DragMoveEvent) {
    setOffsetX(event.delta.x)
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setActiveId(null)
    setOffsetX(0)
    if (!overId) return

    const overIndex = visibleRows.findIndex((row) => row.feature.id === overId)
    if (overIndex === -1) return

    const result = projectDrop(
      visibleRows,
      draggedId,
      overIndex,
      Math.round(event.delta.x / INDENT_WIDTH),
    )
    if (result) onMove(draggedId, result)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOffsetX(0)
      }}
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
            <StatusBadge status={activeFeature.status} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
