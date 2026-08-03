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
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  ComboboxValue,
} from '@/ui/components/ui/combobox'
import { MAX_TAG_COUNT, MAX_TAG_LENGTH, MAX_TITLE_LENGTH, type Feature } from '@/lib/types'
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
  // The combobox's own search text, not a tag until it's picked or created.
  const [tagQuery, setTagQuery] = useState('')
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
    setTagQuery('')
  }, [open, feature, statuses])

  const isEdit = feature !== undefined

  // A tag just created by typing isn't in `availableTags` (that only reflects tags already
  // saved elsewhere), so it has to stay in `items` via the current selection instead, or it
  // vanishes from the combobox's collection the moment the query moves on — which left the
  // list unable to show anything at all for the next tag typed after it.
  const knownTags = [...new Set([...availableTags, ...draft.tags])]

  // Offer to create a new tag once the query doesn't match one already on offer or chosen.
  const trimmedTagQuery = tagQuery.trim()
  const tagAlreadyChosen = knownTags.some(
    (tag) => tag.toLowerCase() === trimmedTagQuery.toLowerCase(),
  )
  // Filtered by hand and passed as `filteredItems`: the combobox's own default filter
  // stopped matching a freshly typed tag against itself once a previous tag had already
  // been picked, leaving the list stuck showing only the earlier pick.
  const matchingTags = knownTags.filter((tag) =>
    tag.toLowerCase().includes(trimmedTagQuery.toLowerCase()),
  )
  const tagItems =
    trimmedTagQuery !== '' && !tagAlreadyChosen ? [...matchingTags, trimmedTagQuery] : matchingTags

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

            {/* Tags are free-form strings in frontmatter: type to filter the ones already in
                use, or keep typing to offer creating a new one. */}
            <Field>
              <FieldLabel htmlFor="feature-tags">Tags</FieldLabel>
              <FieldDescription id="feature-tags-hint">
                Search existing tags or type a new one.
              </FieldDescription>
              <Combobox
                items={tagItems}
                filteredItems={tagItems}
                multiple
                value={draft.tags}
                onValueChange={(tags, eventDetails) => {
                  if (eventDetails.reason !== 'escape-key' && tags.length <= MAX_TAG_COUNT) {
                    setDraft({ ...draft, tags })
                  }
                }}
                inputValue={tagQuery}
                onInputValueChange={setTagQuery}
                autoHighlight
              >
                <ComboboxChips>
                  <ComboboxValue>
                    {(tags: string[]) => (
                      <>
                        {tags.map((tag) => (
                          <ComboboxChip key={tag} removeLabel={`Remove ${tag}`}>
                            {tag}
                          </ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          id="feature-tags"
                          maxLength={MAX_TAG_LENGTH}
                          // Not just the label's `for`: the field's own popup, once open,
                          // makes the rest of the dialog inert, including this sibling label,
                          // so an assistive technology user loses the field's name at the
                          // exact moment they're using it. A literal string survives that.
                          aria-label="Tags"
                          aria-describedby="feature-tags-hint"
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxEmpty>No tags found.</ComboboxEmpty>
                  <ComboboxList>
                    {(tag: string) => (
                      <ComboboxItem key={tag} value={tag}>
                        {knownTags.includes(tag) ? tag : `Create "${tag}"`}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
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
