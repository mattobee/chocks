import { Fragment, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
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
import { Button } from '@/ui/components/ui/button'
import { Badge } from '@/ui/components/ui/badge'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { Textarea } from '@/ui/components/ui/textarea'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { Separator } from '@/ui/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/ui/components/ui/select'
import { DeleteFeatureDialog } from '@/ui/components/delete-feature-dialog'
import { useFeatureMutations, useWatchFiles } from '@/ui/hooks/use-features'
import { allTags, ancestorsOf, findByKey, siblingsOf } from '@/lib/tree'
import { featuresQuery, workspaceQuery } from '@/ui/lib/queries'
import { DEFAULT_STATUSES } from '@/lib/status'
import { featureKey, FEATURE_SUFFIX } from '@/lib/ids'

// The URL carries `<slug>~<uid>`: the slug so a pasted link is readable, the uid so it
// keeps resolving after the feature is renamed or moved.
export const Route = createFileRoute('/f/$featureKey')({
  component: FeaturePage,
})

function FeaturePage() {
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
  const children = siblingsOf(featureList, featureId)
  const tags = allTags(featureList)

  function commitTitle() {
    const next = title.trim()
    if (next === '' || next === feature!.title) {
      setTitle(feature!.title)
      return
    }
    update.mutate({ id: featureId, title: next })
  }

  function commitDescription() {
    if (description === feature!.description) return
    update.mutate({ id: featureId, description })
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

        <div className="mb-2 flex items-start gap-3">
          <Input
            aria-label="Feature title"
            value={title}
            maxLength={300}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setTitle(feature.title)
                event.currentTarget.blur()
              }
            }}
            className="h-auto flex-1 border-0 bg-transparent p-0 !text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete feature"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
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

        <div className="mb-8 grid gap-2">
          <Label htmlFor="feature-description">Description</Label>
          <Textarea
            id="feature-description"
            rows={8}
            maxLength={10000}
            placeholder="Markdown. What is this feature, and what would done look like?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={commitDescription}
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground text-xs">Written to the file when you click away.</p>
        </div>

        <Separator className="mb-6" />

        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-sm font-medium">
            Sub-features{children.length > 0 && ` (${children.length})`}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setChildDialogOpen(true)}>
            <Plus className="size-4" />
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
