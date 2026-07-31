import { Search, X } from 'lucide-react'
import { Input } from '@/ui/components/ui/input'
import { Button } from '@/ui/components/ui/button'
import { Badge } from '@/ui/components/ui/badge'
import type { StatusDefinition } from '@/lib/status'
import type { TreeFilters } from '@/lib/tree'

export function FeatureFilters({
  filters,
  statuses,
  tags,
  matchCount,
  onChange,
}: {
  filters: TreeFilters
  statuses: StatusDefinition[]
  /** Every tag currently in use anywhere in the tree. */
  tags: string[]
  matchCount: number | null
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

  const active = filters.query !== '' || filters.statuses.length > 0 || filters.tags.length > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search features…"
            aria-label="Search features"
            className="ps-8"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ query: '', statuses: [], tags: [] })}
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {statuses.map((status) => {
          const selected = filters.statuses.includes(status.id)
          return (
            <button
              key={status.id}
              type="button"
              onClick={() => toggleStatus(status.id)}
              aria-pressed={selected}
            >
              <Badge variant={selected ? 'default' : 'outline'} className="cursor-pointer">
                {status.label}
              </Badge>
            </button>
          )
        })}

        {tags.length > 0 && <span className="bg-border mx-1 h-4 w-px" aria-hidden />}

        {tags.map((tag) => {
          const selected = filters.tags.includes(tag)
          return (
            <button key={tag} type="button" onClick={() => toggleTag(tag)} aria-pressed={selected}>
              <Badge variant={selected ? 'default' : 'outline'} className="cursor-pointer">
                {tag}
              </Badge>
            </button>
          )
        })}

        {matchCount !== null && (
          <span className="text-muted-foreground ms-auto text-xs">
            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
          </span>
        )}
      </div>
    </div>
  )
}
