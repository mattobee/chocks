import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus, SquareDot, Trash2, TriangleAlert } from 'lucide-react'

import { FeatureDialog, type FeatureDraft } from '@/ui/components/feature-dialog'
import { StatusDropdown } from '@/ui/components/status-dropdown'
import { TagEditor } from '@/ui/components/tag-editor'
import { FeatureLinks } from '@/ui/components/feature-links'
import { FeatureCode } from '@/ui/components/feature-code'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/ui/components/ui/breadcrumb'
import { FeatureHistory } from '@/ui/components/feature-history'
import { Markdown } from '@/ui/components/markdown'
import { Button } from '@/ui/components/ui/button'
import { Badge } from '@/ui/components/ui/badge'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/ui/components/ui/item'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from '@/ui/components/ui/input-group'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { DeleteFeatureDialog } from '@/ui/components/delete-feature-dialog'
import { useFeatureMutations } from '@/ui/hooks/use-features'
import { allTags, ancestorsOf, childrenOf, findByKey } from '@/lib/tree'
import { featuresQuery, uncommittedQuery, workspaceQuery } from '@/ui/lib/queries'
import { DEFAULT_STATUSES, MODIFIED_COLOR } from '@/lib/status'
import { featureKey } from '@/lib/ids'
import { describeError } from '@/lib/errors'
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '@/lib/types'

// The URL carries `<slug>~<uid>`: the slug so a pasted link is readable, the uid so it
// keeps resolving after the feature is renamed or moved.
export const Route = createFileRoute('/_layout/f/$featureKey')({
  component: FeaturePage,
})

/** Exported so its branch order can be tested; the route below is the only caller. */
export function FeaturePage() {
  const { featureKey: key } = Route.useParams()
  const navigate = useNavigate()

  const features = useQuery(featuresQuery())
  const workspace = useQuery(workspaceQuery())
  const uncommitted = useQuery(uncommittedQuery())
  const statuses = workspace.data?.config.statuses ?? DEFAULT_STATUSES

  const featureList = features.data ?? []
  const uncommittedIds = useMemo(
    () => new Set(uncommitted.data?.ids ?? []),
    [uncommitted.data?.ids],
  )
  const { create, update, remove } = useFeatureMutations(featureList)

  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const [describing, setDescribing] = useState(false)
  const describeInputRef = useRef<HTMLTextAreaElement>(null)
  const describeButtonRef = useRef<HTMLButtonElement>(null)
  const returnDescribeFocus = useRef(false)
  const [childDialogOpen, setChildDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const feature = findByKey(featureList, key)
  const featureId = feature?.id ?? ''

  // Depend on the individual fields, not the object: every refetch is a new identity and
  // would otherwise reset the inputs mid-edit.
  const savedId = feature?.id
  const savedTitle = feature?.title
  const savedDescription = feature?.description
  useEffect(() => {
    if (savedId === undefined) return
    setTitle(savedTitle ?? '')
    setDescription(savedDescription ?? '')
  }, [savedId, savedTitle, savedDescription])

  /**
   * Moves focus with the swap, in both directions.
   *
   * Going in: focus then select. A browser moves focus as a side effect of `select()`, but
   * leaning on that leaves the important half implicit, and renaming usually means
   * replacing the title rather than appending to it.
   *
   * Coming out: back to the button that opened it, rather than dropping focus on the body.
   * It has to happen here because neither control exists until the swap has rendered.
   */
  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    } else if (returnFocus.current) {
      returnFocus.current = false
      // After the current key sequence, not during it. Enter commits on keydown, and
      // focusing the button straight away puts it under the keyup that follows, which
      // activates it and reopens the very editor that just closed.
      const timer = setTimeout(() => renameButtonRef.current?.focus())
      return () => clearTimeout(timer)
    }
  }, [renaming])

  // Same swap as the title: focus follows the control that replaced the one you used, and
  // going back is deferred so a committing keystroke cannot land on the button behind it.
  useEffect(() => {
    if (describing) {
      describeInputRef.current?.focus()
    } else if (returnDescribeFocus.current) {
      returnDescribeFocus.current = false
      const timer = setTimeout(() => describeButtonRef.current?.focus())
      return () => clearTimeout(timer)
    }
  }, [describing])

  if (features.isPending) {
    return (
      <>
        <div className="grid gap-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-9 w-96" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    )
  }

  // Before the not-found case, because they are not the same thing. A request that failed
  // otherwise reads as a feature someone deleted, which sends you looking for the wrong
  // problem, and nothing refetches on its own to correct it.
  if (features.isError) {
    return (
      <>
        <Empty className="border">
          <EmptyHeader>
            {/* Same tint as the delete dialog's icon, so "this is destructive/wrong" reads
                the same way wherever it shows up. */}
            <EmptyMedia
              variant="icon"
              className="bg-destructive/10 text-destructive-on-tint dark:bg-destructive/20"
            >
              <TriangleAlert aria-hidden="true" />
            </EmptyMedia>
            {/* h1: nothing else on this render has a heading, so this is the page's. */}
            <EmptyTitle render={<h1 />}>Could not load the feature tree</EmptyTitle>
            <EmptyDescription>{describeError(features.error)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void features.refetch()}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" render={<Link to="/" />}>
                Back to the tree
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  if (!feature) {
    return (
      <>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle render={<h1 />}>
              No feature matching <code className="font-mono">{key}</code>
            </EmptyTitle>
            <EmptyDescription>It may have been deleted.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link to="/" />}>
              Back to the tree
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  const ancestors = ancestorsOf(featureList, featureId)
  const children = childrenOf(featureList, featureId)
  const tags = allTags(featureList)

  function stopRenaming() {
    returnFocus.current = true
    setRenaming(false)
  }

  function commitTitle() {
    stopRenaming()
    const next = title.trim()
    if (next === '' || next === feature!.title) {
      setTitle(feature!.title)
      return
    }
    update.mutate({ id: featureId, title: next })
  }

  function cancelRename() {
    stopRenaming()
    setTitle(feature!.title)
  }

  function commitDescription() {
    returnDescribeFocus.current = true
    setDescribing(false)
    if (description === feature!.description) return
    update.mutate({ id: featureId, description })
  }

  function cancelDescription() {
    returnDescribeFocus.current = true
    setDescribing(false)
    setDescription(feature!.description)
  }

  function handleCreateChild(draft: FeatureDraft) {
    create.mutate({ parent: featureId, ...draft }, { onSuccess: () => setChildDialogOpen(false) })
  }

  return (
    <>
      <>
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />}>Features</BreadcrumbLink>
            </BreadcrumbItem>
            {ancestors.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    render={
                      <Link to="/f/$featureKey" params={{ featureKey: featureKey(ancestor) }} />
                    }
                  >
                    {ancestor.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Fragment>
            ))}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {/* Ends on the current feature so the trail is complete and the last item
                  carries aria-current="page". */}
              <BreadcrumbPage>{feature.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-2 flex items-center gap-3">
          {renaming ? (
            // Taller than the default inline field: this is the page title, and two
            // buttons sit inside it.
            <InputGroup className="h-10 flex-1">
              <InputGroupInput
                ref={renameInputRef}
                aria-label="Feature title"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitTitle()
                  if (event.key === 'Escape') cancelRename()
                }}
              />
              {/* Deliberately no save on blur. Clicking Cancel blurs the field first, so
                  saving there would commit the edit the click was asking to throw away. */}
              {/* Only the negative margin is overridden, and with the same variant or
                  tailwind-merge keeps both. It pulls buttons about 5px back toward the
                  edge, which suits an icon but leaves a text button's focus ring on the
                  border. The addon's own pr-2 then matches the vertical gap. */}
              <InputGroupAddon align="inline-end" className="has-[>button]:mr-0">
                <InputGroupButton onClick={cancelRename}>Cancel</InputGroupButton>
                <InputGroupButton variant="default" onClick={commitTitle}>
                  Save
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <>
              {/* The page's heading, which it did not have before: the title was an input
                  dressed as one, so there was nothing for a screen reader to navigate to. */}
              <h1 className="flex-1 text-3xl font-semibold tracking-tight">{feature.title}</h1>
              {/* Short visible label; the longer accessible name says what it renames when
                  read out of context, where "Rename" alone doesn't. */}
              <Button
                ref={renameButtonRef}
                variant="secondary"
                size="sm"
                aria-label="Rename feature"
                onClick={() => setRenaming(true)}
              >
                Rename
              </Button>
            </>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusDropdown
            statuses={statuses}
            status={feature.status}
            ariaLabel="Status"
            onChange={(status) => update.mutate({ id: featureId, status })}
          />
          {feature.importance && (
            <Badge variant={feature.importance === 'high' ? 'destructive' : 'secondary'}>
              {feature.importance === 'high' ? 'High importance' : 'Low importance'}
            </Badge>
          )}
        </div>

        <div className="mb-6 max-w-sm">
          <TagEditor
            tags={feature.tags}
            availableTags={tags}
            onChange={(next) => update.mutate({ id: featureId, tags: next })}
            ariaLabel={`Tags for ${feature.title}`}
          />
        </div>

        <FeatureLinks links={feature.links} />

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="flex-1 text-lg font-semibold">Description</h2>
            {!describing && (
              <Button
                ref={describeButtonRef}
                variant="secondary"
                size="sm"
                onClick={() => setDescribing(true)}
              >
                Edit description
              </Button>
            )}
          </div>

          {describing ? (
            <InputGroup>
              {/* Three overrides, and a dragged height needs all of them. field-sizing-fixed,
                  or it sizes to its content and ignores rows. flex-none, or the group's
                  column flex computes the height and throws away the one you dragged.
                  resize-y in place of its resize-none, vertical only so it cannot be pulled
                  out through the group's border. */}
              <InputGroupTextarea
                ref={describeInputRef}
                aria-label="Description"
                rows={16}
                maxLength={MAX_DESCRIPTION_LENGTH}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  // Enter belongs to the text here, so saving needs the modifier.
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    commitDescription()
                  }
                  if (event.key === 'Escape') cancelDescription()
                }}
                className="field-sizing-fixed flex-none resize-y font-mono text-sm"
              />
              {/* Not the default xs. That is sized for a button tucked inside a one-line
                    field; this is a footer bar with room, and 24px is small for a target. */}
              <InputGroupAddon align="block-end" className="justify-end">
                <InputGroupButton size="sm" onClick={cancelDescription}>
                  Cancel
                </InputGroupButton>
                <InputGroupButton size="sm" variant="default" onClick={commitDescription}>
                  Save
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : feature.description ? (
            <Markdown>{feature.description}</Markdown>
          ) : (
            <p className="text-muted-foreground">No description yet.</p>
          )}
        </div>

        <FeatureCode featureId={featureId} code={feature.code} />

        <div className="mt-8 mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-semibold">
            Sub-features{children.length > 0 && ` (${children.length})`}
          </h2>
          <Button variant="secondary" size="sm" onClick={() => setChildDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            Add sub-feature
          </Button>
        </div>

        {children.length > 0 ? (
          // A real ul rather than ItemGroup, which is a div with role="list". The registry's
          // own example puts role="listitem" on the anchor, which costs it the link role.
          // The border and dividers live here: ItemGroup is gapped cards, and these rows
          // read better as one list.
          <ul className="divide-y overflow-hidden rounded-lg border">
            {children.map((child) => (
              <li key={child.id}>
                {/* The title is the link, not the whole row: the row carries a status
                    picker, and an interactive control cannot live inside an anchor. */}
                <Item className="rounded-none border-0">
                  <ItemContent>
                    <ItemTitle>
                      {uncommittedIds.has(child.id) && (
                        <SquareDot
                          role="img"
                          aria-label="Modified"
                          className={`size-4 shrink-0 ${MODIFIED_COLOR}`}
                        />
                      )}
                      <Link
                        to="/f/$featureKey"
                        params={{ featureKey: featureKey(child) }}
                        className="hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none rounded-md"
                      >
                        {child.title}
                      </Link>
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <StatusDropdown
                      statuses={statuses}
                      status={child.status}
                      ariaLabel={`Status of ${child.title}`}
                      size="xs"
                      onChange={(status) => update.mutate({ id: child.id, status })}
                    />
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        ) : (
          // No action in here: Add already sits in the section heading above.
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No sub-features</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        <h2 className="mt-8 mb-3 text-lg font-semibold">History</h2>
        <FeatureHistory featureId={featureId} />

        {/* Last on the page and out of the way. It used to sit beside Rename at the top,
            one 32px target away from the button you reach for most. */}
        <div className="mt-10 border-t pt-6">
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 data-icon="inline-start" />
            Delete feature
          </Button>
        </div>
      </>

      <FeatureDialog
        open={childDialogOpen}
        onOpenChange={setChildDialogOpen}
        availableTags={tags}
        statuses={statuses}
        busy={create.isPending}
        onSubmit={handleCreateChild}
      />

      <DeleteFeatureDialog
        feature={confirmDelete ? feature : null}
        features={featureList}
        onOpenChange={setConfirmDelete}
        onConfirm={(target) => {
          // The page being deleted is the one we are on, so go somewhere that still exists.
          remove.mutate(target.id, {
            onSuccess: () => {
              const parentFeature = featureList.find((item) => item.id === target.parent)
              void navigate(
                parentFeature
                  ? { to: '/f/$featureKey', params: { featureKey: featureKey(parentFeature) } }
                  : { to: '/' },
              )
            },
          })
        }}
      />
    </>
  )
}
