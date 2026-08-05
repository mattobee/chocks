import { ListFilter, X } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu'
import type { StatusDefinition } from '@/lib/status'
import type { TreeFilters } from '@/lib/tree'

/**
 * One "Filter" button with the status and tag pickers nested inside it as submenus, rather
 * than a separate dropdown per category — narrow as the sidebar is, there isn't room to lay
 * them out side by side the way the old full-page tree could.
 */
export function FeatureFilterMenu({
  statuses,
  tags,
  filters,
  onChange,
}: {
  statuses: StatusDefinition[]
  /** Every tag currently in use anywhere in the tree. */
  tags: string[]
  filters: TreeFilters
  onChange: (filters: TreeFilters) => void
}) {
  function toggleStatus(status: string) {
    onChange({
      ...filters,
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((value) => value !== status)
        : [...filters.statuses, status],
    })
  }

  function toggleTag(tag: string) {
    onChange({
      ...filters,
      tags: filters.tags.includes(tag)
        ? filters.tags.filter((value) => value !== tag)
        : [...filters.tags, tag],
    })
  }

  const activeCount = filters.statuses.length + filters.tags.length
  const hasActiveFilters = activeCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={hasActiveFilters ? `Filter, ${activeCount} active` : 'Filter'}
          />
        }
      >
        <ListFilter />
        {hasActiveFilters && (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full text-[10px] leading-none"
          >
            {activeCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {statuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status.id}
                checked={filters.statuses.includes(status.id)}
                onCheckedChange={() => toggleStatus(status.id)}
              >
                {status.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {tags.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Tags</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {tags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={filters.tags.includes(tag)}
                  onCheckedChange={() => toggleTag(tag)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange({ ...filters, statuses: [], tags: [] })}>
              <X aria-hidden="true" />
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
