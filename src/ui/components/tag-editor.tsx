import { useState } from 'react'
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
import { MAX_TAG_COUNT, MAX_TAG_LENGTH } from '@/lib/types'

/**
 * Tags are free-form strings in frontmatter: type to filter the ones already in use, or
 * keep typing to offer creating a new one. Shared by the create/edit dialog and the
 * feature page, which commits on every change rather than on a form submit.
 */
export function TagEditor({
  tags,
  availableTags,
  onChange,
  ariaLabel = 'Tags',
  describedBy,
  inputId,
  className,
}: {
  tags: string[]
  /** Every tag currently in use anywhere in the tree, for the picker's suggestions. */
  availableTags: string[]
  onChange: (tags: string[]) => void
  /**
   * A literal string, not a visible label's `htmlFor`: the field's own popup, once open,
   * makes the rest of the page inert, including any sibling label, so an assistive
   * technology user would lose the field's name at the exact moment they're using it.
   */
  ariaLabel?: string
  describedBy?: string
  inputId?: string
  className?: string
}) {
  const [tagQuery, setTagQuery] = useState('')

  // A tag just created by typing isn't in `availableTags`, so it has to stay in `items`
  // via the current selection, or it vanishes the moment the query moves on.
  const knownTags = [...new Set([...availableTags, ...tags])]

  // Offer to create a new tag once the query doesn't match one already on offer or chosen.
  const trimmedTagQuery = tagQuery.trim()
  const tagAlreadyChosen = knownTags.some(
    (tag) => tag.toLowerCase() === trimmedTagQuery.toLowerCase(),
  )
  // Filtered by hand: the combobox's own filter stopped matching a freshly typed tag
  // against itself once a previous tag had been picked.
  const matchingTags = knownTags.filter((tag) =>
    tag.toLowerCase().includes(trimmedTagQuery.toLowerCase()),
  )
  const tagItems =
    trimmedTagQuery !== '' && !tagAlreadyChosen ? [...matchingTags, trimmedTagQuery] : matchingTags

  return (
    <Combobox
      items={tagItems}
      filteredItems={tagItems}
      multiple
      value={tags}
      onValueChange={(next, eventDetails) => {
        if (eventDetails.reason !== 'escape-key' && next.length <= MAX_TAG_COUNT) {
          onChange(next)
        }
      }}
      inputValue={tagQuery}
      onInputValueChange={setTagQuery}
      autoHighlight
    >
      <ComboboxChips className={className}>
        <ComboboxValue>
          {(currentTags: string[]) => (
            <>
              {currentTags.map((tag) => (
                <ComboboxChip key={tag} removeLabel={`Remove ${tag}`}>
                  {tag}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={inputId}
                maxLength={MAX_TAG_LENGTH}
                aria-label={ariaLabel}
                aria-describedby={describedBy}
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
  )
}
