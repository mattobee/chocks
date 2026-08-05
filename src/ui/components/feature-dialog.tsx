import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
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
import { TagEditor } from '@/ui/components/tag-editor'
import { MAX_TITLE_LENGTH, type Feature } from '@/lib/types'
import { defaultStatusId, statusOrUnknown, type StatusDefinition } from '@/lib/status'
import { StatusDot } from '@/ui/components/status-dot'

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
            onSubmit({ ...draft, title: draft.title.trim() })
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit feature' : 'New feature'}</DialogTitle>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="feature-title">Title</FieldLabel>
              <Input
                id="feature-title"
                ref={titleRef}
                autoFocus
                required
                maxLength={MAX_TITLE_LENGTH}
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
                    {(value) => (
                      <>
                        <StatusDot statuses={statuses} status={String(value ?? '')} />
                        {statusOrUnknown(statuses, String(value ?? '')).label}
                      </>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <StatusDot statuses={statuses} status={status.id} />
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="feature-tags">Tags</FieldLabel>
              <FieldDescription id="feature-tags-hint">
                Search existing tags or type a new one.
              </FieldDescription>
              <TagEditor
                tags={draft.tags}
                availableTags={availableTags}
                onChange={(tags) => setDraft({ ...draft, tags })}
                ariaLabel="Tags"
                describedBy="feature-tags-hint"
                inputId="feature-tags"
              />
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

function emptyDraft(status: string): FeatureDraft {
  return { title: '', description: '', status, tags: [] }
}
