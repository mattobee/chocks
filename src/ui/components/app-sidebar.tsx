import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
  keyboardDragAndDropFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type DragTarget,
  type ItemInstance,
} from '@headless-tree/core'
import { AssistiveTreeDescription, useTree } from '@headless-tree/react'
import { ChevronRight, FolderGit2, Plus, Search, SquareDot, X } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/ui/components/ui/sidebar'
import { Tree, TreeDragLine, TreeItem } from '@/ui/components/ui/tree'
import { Button } from '@/ui/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/ui/components/ui/input-group'
import { FeatureDialog, type FeatureDraft } from '@/ui/components/feature-dialog'
import { FeatureFilterMenu } from '@/ui/components/feature-filter-menu'
import { cn } from '@/lib/utils'
import {
  allTags,
  ancestorsOf,
  buildTree,
  collectExpandableIds,
  filterTree,
  findByKey,
  isFiltering,
  ROOT_PARENT,
  type TreeFilters,
  type TreeNode,
} from '@/lib/tree'
import { featureKey } from '@/lib/ids'
import { featuresQuery, uncommittedQuery, workspaceQuery } from '@/ui/lib/queries'
import { useExpanded } from '@/ui/hooks/use-expanded'
import { useFeatureMutations } from '@/ui/hooks/use-features'
import { DEFAULT_STATUSES, MODIFIED_COLOR } from '@/lib/status'
import type { Feature } from '@/lib/types'

/**
 * Matches the chevron button's own width (`size-6`) so each level of indent is exactly one
 * chevron-column wide — the guide line for a given depth is centred in that column, which
 * only lines up with the ancestor's own chevron if the two widths agree.
 */
const INDENT_WIDTH = 24

/**
 * Headless Tree needs a real item id for the root, and every feature's `id` is a real path,
 * so a sentinel here can't collide with one. It is never rendered — `tree.getItems()` only
 * yields its descendants — but the data loader still has to resolve it to something.
 */
const ROOT_ITEM_ID = '$root'
const ROOT_FEATURE: Feature = {
  id: ROOT_ITEM_ID,
  uid: '',
  parent: '',
  title: 'Features',
  description: '',
  status: '',
  tags: [],
  sort: '',
}

function nodeMapOf(nodes: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>()
  function walk(input: TreeNode[]) {
    for (const node of input) {
      map.set(node.feature.id, node)
      walk(node.children)
    }
  }
  walk(nodes)
  return map
}

/**
 * Reused rather than a fresh `[]` on every render with no data — `useTree` treats a new
 * array identity as a structural change, and would otherwise rebuild (and re-notify
 * controlled state) on every render for as long as the query is loading.
 */
const NO_FEATURES: Feature[] = []

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const features = useQuery(featuresQuery())
  const workspace = useQuery(workspaceQuery())
  const uncommitted = useQuery(uncommittedQuery())
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()

  const featureList = features.data ?? NO_FEATURES
  const uncommittedIds = useMemo(
    () => new Set(uncommitted.data?.ids ?? []),
    [uncommitted.data?.ids],
  )
  const { create, move } = useFeatureMutations(featureList)
  const { expanded, setExpanded } = useExpanded()
  const statuses = workspace.data?.config.statuses ?? DEFAULT_STATUSES

  const [filters, setFilters] = useState<TreeFilters>({ query: '', statuses: [], tags: [] })
  const [dialogOpen, setDialogOpen] = useState(false)
  const tags = useMemo(() => allTags(featureList), [featureList])

  function handleCreate(draft: FeatureDraft) {
    create.mutate(
      { parent: ROOT_PARENT, ...draft },
      {
        onSuccess: (created) => {
          setDialogOpen(false)
          void navigate({ to: '/f/$featureKey', params: { featureKey: featureKey(created) } })
        },
      },
    )
  }

  const match = matchRoute({ to: '/f/$featureKey', params: {} })
  const currentKey = match ? (match as { featureKey: string }).featureKey : undefined

  // A link or a reload lands you straight on a feature page without ever touching its
  // ancestors' chevrons, so nothing has opened them — read via a ref rather than a
  // dependency, or every toggle would run this again and re-expand whatever the user just
  // collapsed while still on the same page.
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  useEffect(() => {
    if (!currentKey) return
    const current = findByKey(featureList, currentKey)
    if (!current) return
    const ancestors = ancestorsOf(featureList, current.id)
    const missing = ancestors.filter((ancestor) => !expandedRef.current.has(ancestor.id))
    if (missing.length === 0) return
    const next = new Set(expandedRef.current)
    for (const ancestor of missing) next.add(ancestor.id)
    setExpanded(next)
  }, [currentKey, featureList, setExpanded])

  const rawTree = useMemo(() => buildTree(featureList), [featureList])
  const filtered = useMemo(() => filterTree(rawTree, filters), [rawTree, filters])
  const filtering = isFiltering(filters)

  // Search prunes to matches and the ancestors needed to reach them, so the pruned branches
  // have to be forced open — otherwise the very thing a search found stays hidden inside a
  // folder collapsed from before the search began.
  const nodeById = useMemo(() => nodeMapOf(filtered.nodes), [filtered.nodes])
  const expandedItems = useMemo(
    () => [...(filtering ? collectExpandableIds(filtered.nodes) : expanded)],
    [filtering, filtered.nodes, expanded],
  )

  function handleDrop(items: ItemInstance<Feature>[], target: DragTarget<Feature>) {
    const dragged = items[0]
    if (!dragged) return
    const draggedId = dragged.getId()
    const targetId = target.item.getId()
    const parentId = targetId === ROOT_ITEM_ID ? ROOT_PARENT : targetId

    const siblingIds = target.item
      .getChildren()
      .map((child) => child.getId())
      .filter((id) => id !== draggedId)

    const afterId = isOrderedDragTarget(target)
      ? target.insertionIndex > 0
        ? (siblingIds[target.insertionIndex - 1] ?? null)
        : null
      : siblingIds.length > 0
        ? (siblingIds[siblingIds.length - 1] ?? null)
        : null

    move.mutate({ id: draggedId, newParent: parentId, afterId })
  }

  const tree = useTree<Feature>({
    rootItemId: ROOT_ITEM_ID,
    getItemName: (item) => item.getItemData().title,
    isItemFolder: (item) => (nodeById.get(item.getId())?.children.length ?? 0) > 0,
    dataLoader: {
      getItem: (itemId) => nodeById.get(itemId)?.feature ?? ROOT_FEATURE,
      getChildren: (itemId) => {
        const children =
          itemId === ROOT_ITEM_ID ? filtered.nodes : (nodeById.get(itemId)?.children ?? [])
        return children.map((node) => node.feature.id)
      },
    },
    indent: INDENT_WIDTH,
    canReorder: true,
    // A filtered view is a search result, not a place to reorganise from — reordering it
    // would write sort keys derived from whatever happens to still be visible.
    canDrag: () => !filtering,
    canDrop: (dragItems, target) => {
      const dragged = dragItems[0]
      if (!dragged) return false
      if (target.item.equals(dragged)) return false
      // Dropping into your own descendant would need a cycle the store can't represent.
      return !target.item.isDescendentOf(dragged.getId())
    },
    onDrop: handleDrop,
    onPrimaryAction: (item) => {
      if (item.getId() === ROOT_ITEM_ID) return
      void navigate({
        to: '/f/$featureKey',
        params: { featureKey: featureKey(item.getItemData()) },
      })
    },
    state: { expandedItems },
    setExpandedItems: (updater) => {
      // Forced open by the search above; toggling shouldn't fight that or get persisted.
      if (filtering) return
      const prevArray = [...expanded]
      const next = typeof updater === 'function' ? updater(prevArray) : updater
      setExpanded(new Set(next))
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
  })

  // Headless Tree's sync data loader reads `dataLoader` fresh each render but only
  // recomputes its flattened view on request — this is that request, made whenever the
  // feature list or the active search changes what should be visible.
  //
  // `tree` itself is a new object every render (it is not memoized by the library), so it
  // cannot be a dependency here without retriggering on every render — `nodeById` already
  // changes exactly when the data this reads from does, and the effect closes over
  // whichever `tree` was current when that happened.
  useEffect(() => {
    tree.scheduleRebuildTree()
  }, [nodeById])

  const items = tree.getItems()

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" className="gap-2">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <FolderGit2 className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">chocks</span>
                  <span className="truncate text-xs">{workspace.data?.name ?? '…'}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-2 px-3 py-2">
          <InputGroup className="h-8 flex-1">
            <InputGroupAddon>
              <Search className="size-3" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search features"
              placeholder="Search…"
              className="h-8 text-xs [&::-webkit-search-cancel-button]:hidden"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
            {filters.query !== '' && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Clear search"
                  size="icon-xs"
                  onClick={() => setFilters({ ...filters, query: '' })}
                >
                  <X className="size-3" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <FeatureFilterMenu
            statuses={statuses}
            tags={tags}
            filters={filters}
            onChange={setFilters}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New feature"
            onClick={() => setDialogOpen(true)}
          >
            <Plus />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="min-h-0 flex-1">
          <SidebarGroupLabel>Features</SidebarGroupLabel>
          <SidebarGroupContent>
            <Tree indent={INDENT_WIDTH} tree={tree}>
              <AssistiveTreeDescription tree={tree} />
              {items.map((item) => {
                const feature = item.getItemData()
                const isFolder = item.isFolder()
                const isActive = featureKey(feature) === currentKey
                const matched = !filtering || filtered.matchedIds.has(feature.id)
                // True while something is being dragged over this row in a way that would
                // make it the new parent — on top of the row itself, or between its
                // children. Reordering between siblings is shown by the drag line instead.
                const isDropTarget = item.isDragTarget()

                return (
                  <TreeItem
                    key={item.getId()}
                    item={item}
                    render={<div />}
                    // Scoped to this row alone, sized to its own indent rather than the
                    // tree's deepest branch — a `repeating-linear-gradient` already repeats
                    // forever along its own axis with no help needed from background-size
                    // or -repeat, so it fills exactly this box, one line per level, and
                    // stops where the box does rather than at some deeper sibling's depth.
                    // Each line sits centred in its `--tree-indent`-wide segment rather
                    // than at the segment's edge, which only lines up with the chevron
                    // that owns it because that chevron is the same width as the indent.
                    className="relative before:absolute before:inset-y-0 before:start-0 before:w-(--tree-padding) before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)/2-0.5px),var(--sidebar-border)_calc(var(--tree-indent)/2-0.5px),var(--sidebar-border)_calc(var(--tree-indent)/2+0.5px),transparent_calc(var(--tree-indent)/2+0.5px),transparent_var(--tree-indent))]"
                  >
                    <div
                      className={cn(
                        'group/row flex items-center gap-1 rounded-md pe-1 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        // `TreeItem` sets `outline-hidden` on the actual focusable element
                        // (an ancestor of this div) with nothing in its place — necessary
                        // because that element's box includes the indentation padding, so a
                        // ring drawn around it would start well to the left of the row you
                        // can actually see. `in-focus-visible` reads that ancestor's state
                        // and draws the ring here instead, around the visible row.
                        'in-focus-visible:ring-2 in-focus-visible:ring-sidebar-ring',
                        (isActive || isDropTarget) &&
                          'bg-sidebar-accent text-sidebar-accent-foreground',
                        !matched && 'opacity-55',
                        !filtering && 'cursor-grab',
                      )}
                    >
                      <button
                        type="button"
                        // Out of the natural Tab order — the row itself is the tab stop, and
                        // arrow keys already expand and collapse the focused row — but still
                        // named and reachable directly, for anyone browsing by touch or by
                        // control rather than sequentially.
                        tabIndex={-1}
                        aria-label={
                          isFolder ? (item.isExpanded() ? 'Collapse' : 'Expand') : undefined
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          if (item.isExpanded()) item.collapse()
                          else item.expand()
                        }}
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center text-sidebar-foreground/50',
                          !isFolder && 'invisible',
                        )}
                      >
                        <ChevronRight
                          className={cn(
                            'size-4 transition-transform',
                            item.isExpanded() && 'rotate-90',
                          )}
                        />
                      </button>

                      {uncommittedIds.has(feature.id) && (
                        <SquareDot
                          role="img"
                          aria-label="Modified"
                          className={cn('size-3.5 shrink-0', MODIFIED_COLOR)}
                        />
                      )}

                      <Link
                        to="/f/$featureKey"
                        params={{ featureKey: featureKey(feature) }}
                        tabIndex={-1}
                        // The row's own click (from `item.getProps()`, on the parent div)
                        // selects, focuses, and — for a folder — toggles it expanded. None
                        // of that belongs to "navigate", which is what clicking the title
                        // itself means here: our folders are just features with children,
                        // clicking one to open it shouldn't also silently flip the sidebar
                        // entry's expansion behind you.
                        onClick={(event) => {
                          event.stopPropagation()
                          item.setFocused()
                        }}
                        className="flex-1 cursor-pointer truncate py-1.5"
                      >
                        {feature.title}
                      </Link>
                    </div>
                  </TreeItem>
                )
              })}
              <TreeDragLine />
            </Tree>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="text-sidebar-foreground/40 px-3 py-2 text-xs">
          {workspace.data?.version && `chocks ${workspace.data.version}`}
        </div>
      </SidebarFooter>

      <SidebarRail />

      <FeatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        availableTags={tags}
        statuses={statuses}
        busy={create.isPending}
        onSubmit={handleCreate}
      />
    </Sidebar>
  )
}
