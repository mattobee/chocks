import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, TriangleAlert } from 'lucide-react'
import { AppShell } from '@/ui/components/app-shell'
import { FeatureDialog, type FeatureDraft } from '@/ui/components/feature-dialog'
import { FeatureFilters } from '@/ui/components/feature-filters'
import { FeatureTree } from '@/ui/components/feature-tree'
import { Button } from '@/ui/components/ui/button'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/ui/components/ui/alert'
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/ui/components/ui/empty'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { DeleteFeatureDialog } from '@/ui/components/delete-feature-dialog'
import { useExpanded } from '@/ui/hooks/use-expanded'
import { useFeatureMutations, useWatchFiles } from '@/ui/hooks/use-features'
import { featuresQuery, uncommittedQuery, workspaceQuery } from '@/ui/lib/queries'
import {
  allTags,
  buildTree,
  collectExpandableIds,
  filterTree,
  flattenVisible,
  isFiltering,
  ROOT_PARENT,
  type DropProjection,
  type TreeFilters,
} from '@/lib/tree'
import type { Feature } from '@/lib/types'
import { describeError } from '@/lib/errors'
import { DEFAULT_STATUSES } from '@/lib/status'

type Search = { q?: string; status?: string; tag?: string }

export const Route = createFileRoute('/')({
  // Filter state lives in the URL, so a filtered view is linkable and survives reload.
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
    status: typeof search.status === 'string' && search.status !== '' ? search.status : undefined,
    tag: typeof search.tag === 'string' && search.tag !== '' ? search.tag : undefined,
  }),
  component: TreePage,
})

function TreePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const features = useQuery(featuresQuery())
  const workspace = useQuery(workspaceQuery())
  const uncommitted = useQuery(uncommittedQuery())
  const statuses = workspace.data?.config.statuses ?? DEFAULT_STATUSES
  useWatchFiles()

  const featureList = useMemo(() => features.data ?? [], [features.data])
  const uncommittedIds = useMemo(
    () => new Set(uncommitted.data?.ids ?? []),
    [uncommitted.data?.ids],
  )
  const { create, update, remove, move } = useFeatureMutations(featureList)
  const { expanded, toggle, setExpanded } = useExpanded()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Feature | undefined>(undefined)
  const [newParent, setNewParent] = useState<string>(ROOT_PARENT)
  const [pendingDelete, setPendingDelete] = useState<Feature | null>(null)

  const filters: TreeFilters = useMemo(
    () => ({
      query: search.q ?? '',
      statuses: search.status?.split(',').filter(Boolean) ?? [],
      tags: search.tag?.split(',').filter(Boolean) ?? [],
    }),
    [search.q, search.status, search.tag],
  )

  const tags = useMemo(() => allTags(featureList), [featureList])

  const tree = useMemo(() => buildTree(featureList), [featureList])
  const filtered = useMemo(() => filterTree(tree, filters), [tree, filters])
  const filtering = isFiltering(filters)

  const effectiveExpanded = useMemo(
    () => (filtering ? collectExpandableIds(filtered.nodes) : expanded),
    [filtering, filtered.nodes, expanded],
  )

  const rows = useMemo(
    () => flattenVisible(filtered.nodes, effectiveExpanded),
    [filtered.nodes, effectiveExpanded],
  )

  function applyFilters(next: TreeFilters) {
    void navigate({
      search: {
        q: next.query || undefined,
        status: next.statuses.length > 0 ? next.statuses.join(',') : undefined,
        tag: next.tags.length > 0 ? next.tags.join(',') : undefined,
      },
      replace: true,
    })
  }

  function openCreate(parentId: string) {
    setEditing(undefined)
    setNewParent(parentId)
    setDialogOpen(true)
    if (parentId !== ROOT_PARENT && !expanded.has(parentId)) {
      setExpanded(new Set([...expanded, parentId]))
    }
  }

  function handleSubmit(draft: FeatureDraft) {
    if (editing) {
      update.mutate({ id: editing.id, ...draft }, { onSuccess: () => setDialogOpen(false) })
    } else {
      create.mutate({ parent: newParent, ...draft }, { onSuccess: () => setDialogOpen(false) })
    }
  }

  function handleMove(id: string, projection: DropProjection) {
    move.mutate({ id, newParent: projection.parentId, afterId: projection.afterId })
  }

  return (
    <AppShell>
      <>
        <div className="mb-5 flex items-center gap-3">
          <h1 className="flex-1 text-3xl font-semibold tracking-tight">Features</h1>
          <Button onClick={() => openCreate(ROOT_PARENT)}>
            <Plus data-icon="inline-start" />
            New feature
          </Button>
        </div>

        <div className="mb-4">
          <FeatureFilters
            filters={filters}
            statuses={statuses}
            tags={tags}
            matchCount={filtering ? filtered.matchedIds.size : null}
            onChange={applyFilters}
          />
        </div>

        {features.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-4/6" />
          </div>
        ) : features.isError ? (
          // The server hands back the real message now, so say it rather than guessing at
          // the cause. Nothing refetches on its own, hence the retry.
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
        ) : rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {filtering ? 'No features match these filters' : 'No features yet'}
              </EmptyTitle>
            </EmptyHeader>
            {/* Nothing to offer when filtering: the fix is to change the filters, which are
                right above this. */}
            {!filtering && (
              <EmptyContent>
                <Button variant="outline" onClick={() => openCreate(ROOT_PARENT)}>
                  <Plus data-icon="inline-start" />
                  Add the first one
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <FeatureTree
            rows={rows}
            statuses={statuses}
            matchedIds={filtered.matchedIds}
            filtering={filtering}
            uncommittedIds={uncommittedIds}
            onToggle={toggle}
            onAddChild={openCreate}
            onEdit={(feature) => {
              setEditing(feature)
              setDialogOpen(true)
            }}
            onDelete={setPendingDelete}
            onMove={handleMove}
          />
        )}
      </>

      <FeatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        feature={editing}
        availableTags={tags}
        statuses={statuses}
        busy={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />

      <DeleteFeatureDialog
        feature={pendingDelete}
        features={featureList}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={(feature) => remove.mutate(feature.id)}
      />
    </AppShell>
  )
}
