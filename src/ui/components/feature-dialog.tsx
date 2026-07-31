import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { Textarea } from '@/ui/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { Badge } from '@/ui/components/ui/badge'
import { cn } from '@/lib/utils'
import { FEATURE_STATUSES, STATUS_LABELS, type Feature, type FeatureStatus } from '@/lib/types'

export interface FeatureDraft {
  title: string
  description: string
  status: FeatureStatus
  tags: string[]
}

export function FeatureDialog({
  open,
  onOpenChange,
  feature,
  availableTags,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Undefined when creating. */
  feature?: Feature
  availableTags: string[]
  busy: boolean
  onSubmit: (draft: FeatureDraft) => void
}) {
  const [draft, setDraft] = useState<FeatureDraft>(emptyDraft())

  // Reset whenever the dialog opens so a previous edit never leaks into the next one.
  useEffect(() => {
    if (!open) return
    setDraft(
      feature
        ? {
            title: feature.title,
            description: feature.description,
            status: feature.status,
            tags: feature.tags,
          }
        : emptyDraft(),
    )
  }, [open, feature])

  const isEdit = feature !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.title.trim() === '') return
            onSubmit({ ...draft, title: draft.title.trim() })
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit feature' : 'New feature'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Update this feature.' : 'Add a feature to the tree.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="feature-title">Title</Label>
              <Input
                id="feature-title"
                autoFocus
                required
                maxLength={300}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feature-description">Description</Label>
              <Textarea
                id="feature-description"
                rows={4}
                maxLength={10000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feature-status">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(value) => setDraft({ ...draft, status: value as FeatureStatus })}
              >
                <SelectTrigger id="feature-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags are free-form strings in frontmatter, so this has to accept new ones,
                not just pick from a fixed list. Existing tags are offered as shortcuts. */}
            <div className="grid gap-2">
              <Label htmlFor="feature-tags">Tags</Label>
              <Input
                id="feature-tags"
                placeholder="comma separated, e.g. ux, api"
                value={draft.tags.join(', ')}
                onChange={(event) => setDraft({ ...draft, tags: parseTags(event.target.value) })}
              />
              {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = draft.tags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            tags: selected
                              ? draft.tags.filter((value) => value !== tag)
                              : [...draft.tags, tag],
                          })
                        }
                        aria-pressed={selected}
                      >
                        <Badge
                          variant={selected ? 'default' : 'outline'}
                          className={cn('cursor-pointer', !selected && 'opacity-70')}
                        >
                          {tag}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || draft.title.trim() === ''}>
              {busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function parseTags(value: string): string[] {
  const tags = value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
  return [...new Set(tags)]
}

function emptyDraft(): FeatureDraft {
  return { title: '', description: '', status: 'planned', tags: [] }
}
