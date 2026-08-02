import { useEffect, useRef, useState } from 'react'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/ui/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { Toggle } from '@/ui/components/ui/toggle'
import type { Feature } from '@/lib/types'
import { defaultStatusId, statusOrUnknown, type StatusDefinition } from '@/lib/status'

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
  const [titleError, setTitleError] = useState<string | null>(null)
  // Held as raw text while typing. Parsing on every keystroke and joining back would strip
  // the separator as soon as you typed it, making a second tag impossible to enter.
  const [tagsText, setTagsText] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

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
    setTitleError(null)
    setTagsText(feature ? feature.tags.join(', ') : '')
  }, [open, feature, statuses])

  const isEdit = feature !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/*
          The submit button is deliberately never disabled. A disabled control gives no
          reason for being unavailable, and pairing it with `required` meant the browser's
          own validation could never fire either, so an empty title failed silently.
          Submitting reports the problem and moves focus to the field instead.
        */}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.title.trim() === '') {
              setTitleError('Enter a title.')
              titleRef.current?.focus()
              return
            }
            setTitleError(null)
            onSubmit({ ...draft, title: draft.title.trim(), tags: parseTags(tagsText) })
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit feature' : 'New feature'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Update this feature.' : 'Add a feature to the tree.'}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="feature-title">Title</FieldLabel>
              <Input
                id="feature-title"
                ref={titleRef}
                autoFocus
                required
                maxLength={300}
                value={draft.title}
                aria-invalid={titleError !== null}
                aria-errormessage={titleError !== null ? 'feature-title-error' : undefined}
                onChange={(event) => {
                  setDraft({ ...draft, title: event.target.value })
                  if (titleError !== null && event.target.value.trim() !== '') setTitleError(null)
                }}
              />
              {/* Keeps the id: FieldError carries role="alert" so it is announced when it
                  appears, but the field's aria-errormessage still has to point at it for
                  anyone who comes back to the field afterwards. */}
              <FieldError id="feature-title-error">{titleError}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="feature-status">Status</FieldLabel>
              <Select
                value={draft.status}
                onValueChange={(value) => setDraft({ ...draft, status: String(value) })}
              >
                <SelectTrigger id="feature-status">
                  {/* Base UI's SelectValue renders the raw value, not the selected item's
                      text, so without this the trigger shows the id (pre-release) rather
                      than the label (Pre-release). */}
                  <SelectValue>
                    {(value) => statusOrUnknown(statuses, String(value ?? '')).label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {/* Tags are free-form strings in frontmatter, so this has to accept new ones,
                not just pick from a fixed list. Existing tags are offered as shortcuts. */}
            <Field>
              <FieldLabel htmlFor="feature-tags">Tags</FieldLabel>
              <FieldDescription id="feature-tags-hint">
                Comma separated, for example: ux, api
              </FieldDescription>
              <Input
                id="feature-tags"
                aria-describedby="feature-tags-hint"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                onBlur={() => setTagsText(parseTags(tagsText).join(', '))}
              />
              {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = parseTags(tagsText).includes(tag)
                    return (
                      <Toggle
                        key={tag}
                        size="sm"
                        variant="outline"
                        pressed={selected}
                        onPressedChange={() => {
                          const current = parseTags(tagsText)
                          const next = selected
                            ? current.filter((value) => value !== tag)
                            : [...current, tag]
                          setTagsText(next.join(', '))
                        }}
                        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary"
                      >
                        {tag}
                      </Toggle>
                    )
                  })}
                </div>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
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
