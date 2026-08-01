import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { AppShell } from '@/ui/components/app-shell'
import { FeatureDialog, type FeatureDraft } from '@/ui/components/feature-dialog'
import { StatusBadge } from '@/ui/components/status-badge'
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
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/ui/components/ui/alert'
import { Badge } from '@/ui/components/ui/badge'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from '@/ui/components/ui/input-group'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { Separator } from '@/ui/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/ui/components/ui/select'
import { DeleteFeatureDialog } from '@/ui/components/delete-feature-dialog'
import { useFeatureMutations, useWatchFiles } from '@/ui/hooks/use-features'
import { allTags, ancestorsOf, childrenOf, findByKey } from '@/lib/tree'
import { featuresQuery, workspaceQuery } from '@/ui/lib/queries'
import { DEFAULT_STATUSES } from '@/lib/status'
import { featureKey, FEATURE_SUFFIX } from '@/lib/ids'
import { describeError } from '@/lib/errors'

// The URL carries `<slug>~<uid>`: the slug so a pasted link is readable, the uid so it
// keeps resolving after the feature is renamed or moved.
export const Route = createFileRoute('/f/$featureKey')({
  component: FeaturePage,
})

/** Exported so its branch order can be tested; the route below is the only caller. */
export function FeaturePage() {
  const { featureKey: key } = Route.useParams()
  const navigate = useNavigate()

  const features = useQuery(featuresQuery())
  const workspace = useQuery(workspaceQuery())
  const statuses = workspace.data?.config.statuses ?? DEFAULT_STATUSES
  useWatchFiles()

  const featureList = features.data ?? []
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
      <AppShell>
        <div className="grid gap-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-9 w-96" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    )
  }

  // Before the not-found case, because they are not the same thing. A request that failed
  // otherwise reads as a feature someone deleted, which sends you looking for the wrong
  // problem, and nothing refetches on its own to correct it.
  if (features.isError) {
    return (
      <AppShell>
        <>
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Could not load the feature tree</AlertTitle>
            <AlertDescription>{describeError(features.error)}</AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => void features.refetch()}>
                Try again
              </Button>
            </AlertAction>
          </Alert>
          <div className="mt-4 text-center">
            <Button variant="ghost" render={<Link to="/" />}>
              Back to the tree
            </Button>
          </div>
        </>
      </AppShell>
    )
  }

  if (!feature) {
    return (
      <AppShell>
        <>
          <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            No feature matching <code className="font-mono">{key}</code>. It may have been deleted.
          </p>
          <div className="mt-4 text-center">
            <Button variant="outline" render={<Link to="/" />}>
              Back to the tree
            </Button>
          </div>
        </>
      </AppShell>
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
    <AppShell>
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
                maxLength={300}
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
              <h1 className="flex-1 text-2xl font-semibold tracking-tight">{feature.title}</h1>
              <Button
                ref={renameButtonRef}
                variant="ghost"
                size="icon"
                aria-label="Rename feature"
                onClick={() => setRenaming(true)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete feature"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>

        {/* The path is the identity, so showing it makes the file findable in the repo. */}
        <p className="text-muted-foreground mb-5 font-mono text-xs">
          .chocks/{feature.id}
          {FEATURE_SUFFIX}
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Select
            value={feature.status}
            onValueChange={(value) => update.mutate({ id: featureId, status: String(value) })}
          >
            <SelectTrigger aria-label="Status" className="h-8 w-auto">
              <StatusBadge statuses={statuses} status={feature.status} />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {feature.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="mb-8">
          {describing ? (
            <>
              {/* The input group makes it obvious enough what you are editing. The heading
                  stays for anyone navigating the page by its structure. */}
              <h2 className="sr-only">Description</h2>
              <InputGroup>
                <InputGroupTextarea
                  ref={describeInputRef}
                  aria-label="Description"
                  rows={8}
                  maxLength={10000}
                  placeholder="Markdown. What is this feature, and what would done look like?"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter belongs to the text here, so saving needs the modifier.
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      commitDescription()
                    }
                    if (event.key === 'Escape') cancelDescription()
                  }}
                  className="font-mono text-sm"
                />
                <InputGroupAddon align="block-end" className="justify-end">
                  <InputGroupButton onClick={cancelDescription}>Cancel</InputGroupButton>
                  <InputGroupButton variant="default" onClick={commitDescription}>
                    Save
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </>
          ) : (
            // No heading out here. A "Description" label sitting above the description is a
            // row of chrome that tells you nothing the text does not.
            <div className="flex items-start gap-3">
              {feature.description ? (
                <div className="min-w-0 flex-1">
                  <Markdown>{feature.description}</Markdown>
                </div>
              ) : (
                <p className="text-muted-foreground flex-1">No description yet.</p>
              )}
              {/* Pulled up to sit on the first line rather than level with its top: the
                  button is 32px and the line is 20px. */}
              <Button
                ref={describeButtonRef}
                variant="ghost"
                size="icon"
                className="-mt-1.5"
                aria-label="Edit description"
                onClick={() => setDescribing(true)}
              >
                <Pencil />
              </Button>
            </div>
          )}
        </div>

        <Separator className="mb-6" />

        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-sm font-medium">
            Sub-features{children.length > 0 && ` (${children.length})`}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setChildDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>

        {children.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to="/f/$featureKey"
                  params={{ featureKey: featureKey(child) }}
                  className="hover:bg-muted/50 flex items-center gap-3 p-3"
                >
                  <span className="flex-1 truncate text-sm">{child.title}</span>
                  <StatusBadge statuses={statuses} status={child.status} />
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No sub-features.
          </p>
        )}

        <Separator className="my-6" />

        <h2 className="mb-3 text-sm font-medium">History</h2>
        <FeatureHistory featureId={featureId} />
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
    </AppShell>
  )
}
