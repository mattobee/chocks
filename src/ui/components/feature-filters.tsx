import { Search, X } from 'lucide-react'
import { Input } from '@/ui/components/ui/input'
import { Button } from '@/ui/components/ui/button'
import { Toggle } from '@/ui/components/ui/toggle'
import type { StatusDefinition } from '@/lib/status'
import type { TreeFilters } from '@/lib/tree'

// Toggle's own pressed state is a subtle background change. A filter that is on needs to
// read at a glance, so selection is filled rather than tinted.
const SELECTED_CHIP =
  'aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary aria-pressed:hover:bg-primary/90'

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

  // Deliberately not `isFiltering`, which trims the query: a box holding nothing but
  // spaces narrows nothing, but there is still something in it worth offering to clear.
  const hasInput = filters.query !== '' || filters.statuses.length > 0 || filters.tags.length > 0

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
        {hasInput && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ query: '', statuses: [], tags: [] })}
          >
            {/* data-icon is what the button variant keys its leading padding off. */}
            <X data-icon="inline-start" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {statuses.map((status) => {
          const selected = filters.statuses.includes(status.id)
          return (
            <Toggle
              key={status.id}
              size="sm"
              variant="outline"
              pressed={selected}
              onPressedChange={() => toggleStatus(status.id)}
              className={SELECTED_CHIP}
            >
              {status.label}
            </Toggle>
          )
        })}

        {tags.length > 0 && <span className="bg-border mx-1 h-4 w-px" aria-hidden />}

        {tags.map((tag) => {
          const selected = filters.tags.includes(tag)
          return (
            <Toggle
              key={tag}
              size="sm"
              variant="outline"
              pressed={selected}
              onPressedChange={() => toggleTag(tag)}
              className={SELECTED_CHIP}
            >
              {tag}
            </Toggle>
          )
        })}

        {/*
          Typing in the search box silently rewrites the tree below, which a screen reader
          user would otherwise have no way to notice. Rendered unconditionally so the
          region exists before the count first appears — a live region added to the DOM
          already populated announces nothing.
        */}
        <span
          role="status"
          aria-live="polite"
          aria-label="Search results"
          className="text-muted-foreground ms-auto text-xs"
        >
          {matchCount !== null && `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}
        </span>
      </div>
    </div>
  )
}
