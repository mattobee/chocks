import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Badge } from '@/ui/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu'
import { StatusBadge } from '@/ui/components/status-badge'
import { cn } from '@/lib/utils'
import { featureKey } from '@/lib/ids'
import type { Feature } from '@/lib/types'
import type { StatusDefinition } from '@/lib/status'

export const INDENT_WIDTH = 24

export interface FeatureRowProps {
  feature: Feature
  statuses: StatusDefinition[]
  depth: number
  hasChildren: boolean
  expanded: boolean
  /** Matched the active filter directly, as opposed to being kept as ancestor context. */
  matched: boolean
  /** True when a filter is active, which disables dragging. */
  filtering: boolean
  onToggle: (id: string) => void
  onRename: (id: string, title: string) => void
  onAddChild: (parentId: string) => void
  onEdit: (feature: Feature) => void
  onDelete: (feature: Feature) => void
}

export function FeatureRow({
  feature,
  statuses,
  depth,
  hasChildren,
  expanded,
  matched,
  filtering,
  onToggle,
  onRename,
  onAddChild,
  onEdit,
  onDelete,
}: FeatureRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    // Reordering while a filter hides most of the tree would write misleading sort keys.
    disabled: filtering,
  })
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(feature.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  function commitRename() {
    const next = title.trim()
    setRenaming(false)
    if (next !== '' && next !== feature.title) onRename(feature.id, next)
    else setTitle(feature.title)
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingInlineStart: depth * INDENT_WIDTH,
      }}
      className={cn(
        'group hover:bg-muted/50 flex items-center gap-1 rounded-md py-1 pe-1',
        isDragging && 'opacity-40',
        !matched && 'opacity-55',
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => hasChildren && onToggle(feature.id)}
        className={cn('text-muted-foreground shrink-0', !hasChildren && 'invisible')}
      >
        {/* No size here: the button variant sizes its own icons, and setting one opts out. */}
        <ChevronRight
          className={cn('transition-transform', expanded && 'rotate-90')}
          aria-hidden="true"
        />
      </Button>

      {/* dnd-kit needs its listeners and attributes on the element itself, so they are
          spread onto Button rather than a wrapper. */}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Drag to reorder"
        className={cn(
          'text-muted-foreground/60 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          filtering && 'pointer-events-none opacity-0',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </Button>

      {renaming ? (
        <Input
          ref={inputRef}
          value={title}
          className="h-7 flex-1"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') {
              setTitle(feature.title)
              setRenaming(false)
            }
          }}
        />
      ) : (
        <Link
          to="/f/$featureKey"
          params={{ featureKey: featureKey(feature) }}
          className="hover:text-foreground flex-1 truncate text-sm hover:underline"
        >
          {feature.title}
        </Link>
      )}

      {feature.tags.map((tag) => (
        <Badge key={tag} variant="outline" className="hidden shrink-0 sm:inline-flex">
          {tag}
        </Badge>
      ))}

      {/* Read-only here: changing it is a bigger action than a row wants to invite, and
          stays reachable through Edit. */}
      <StatusBadge statuses={statuses} status={feature.status} className="shrink-0" />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Add child of ${feature.title}`}
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => onAddChild(feature.id)}
      >
        <Plus />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${feature.title}`}
              className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(feature)}>Edit…</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTitle(feature.title)
              setRenaming(true)
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddChild(feature.id)}>Add child</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(feature)}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
