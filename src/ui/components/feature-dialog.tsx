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
import { Toggle } from '@/ui/components/ui/toggle'
import type { Feature } from '@/lib/types'
import { defaultStatusId, type StatusDefinition } from '@/lib/status'

export interface FeatureDraft {
  title: string
  description: string
  status: string
  tags: string[]
}

export function FeatureDialog({
  open,
  onOpenChange,
  feature,
  availableTags,
  statuses,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Undefined when creating. */
  feature?: Feature
  availableTags: string[]
  statuses: StatusDefinition[]
  busy: boolean
  onSubmit: (draft: FeatureDraft) => void
}) {
  const [draft, setDraft] = useState<FeatureDraft>(() => emptyDraft(defaultStatusId(statuses)))

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
        : emptyDraft(defaultStatusId(statuses)),
    )
  }, [open, feature, statuses])

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
                onValueChange={(value) => setDraft({ ...draft, status: String(value) })}
              >
                <SelectTrigger id="feature-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.label}
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
                      <Toggle
                        key={tag}
                        size="sm"
                        variant="outline"
                        pressed={selected}
                        onPressedChange={() =>
                          setDraft({
                            ...draft,
                            tags: selected
                              ? draft.tags.filter((value) => value !== tag)
                              : [...draft.tags, tag],
                          })
                        }
                        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary"
                      >
                        {tag}
                      </Toggle>
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

function emptyDraft(status: string): FeatureDraft {
  return { title: '', description: '', status, tags: [] }
}
