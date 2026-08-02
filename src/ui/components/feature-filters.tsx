import { ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Badge } from '@/ui/components/ui/badge'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/ui/components/ui/input-group'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/ui/components/ui/dropdown-menu'
import type { StatusDefinition } from '@/lib/status'
import type { TreeFilters } from '@/lib/tree'

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            aria-label={selected.length > 0 ? `${label}, ${selected.length} selected` : label}
          />
        }
      >
        {label}
        {selected.length > 0 && <Badge variant="secondary">{selected.length}</Badge>}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={selected.includes(option.id)}
            onCheckedChange={() => onToggle(option.id)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

  const hasDropdownFilters = filters.statuses.length > 0 || filters.tags.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-auto min-w-48 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search features"
            className="[&::-webkit-search-cancel-button]:hidden"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
          {filters.query !== '' && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                size="icon-xs"
                onClick={() => onChange({ ...filters, query: '' })}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <FilterDropdown
          label="Status"
          options={statuses.map((status) => ({ id: status.id, label: status.label }))}
          selected={filters.statuses}
          onToggle={toggleStatus}
        />

        {tags.length > 0 && (
          <FilterDropdown
            label="Tags"
            options={tags.map((tag) => ({ id: tag, label: tag }))}
            selected={filters.tags}
            onToggle={toggleTag}
          />
        )}
      </div>

      <div className="flex min-h-8 items-center gap-2">
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
          className="text-muted-foreground text-xs"
        >
          {matchCount !== null && `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}
        </span>

        {hasDropdownFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...filters, statuses: [], tags: [] })}
          >
            <X data-icon="inline-start" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
