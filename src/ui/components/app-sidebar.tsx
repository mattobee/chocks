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
import { ChevronRight, Plus, Search, SquareDot, X } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from '@/ui/components/ui/sidebar'
import { Tree, TreeDragLine, TreeItem } from '@/ui/components/ui/tree'
import { Button } from '@/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip'
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
  EMPTY_FILTERS,
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
 * Must equal the chevron's own width: each depth's guide line is centred in an
 * indent-wide column, and only lines up with the ancestor's chevron if the two match.
 */
const INDENT_WIDTH = 24

/**
 * Every feature id is a real path, so this sentinel can't collide. The data loader still
 * has to resolve it; it just never renders, since getItems() yields descendants only.
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
  links: [],
  code: [],
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
 * A stable `[]` matters: useTree reads a new array identity as a structural change and
 * would rebuild (and re-notify controlled state) on every render while loading.
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

  const [filters, setFilters] = useState<TreeFilters>(EMPTY_FILTERS)
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

  // Read via a ref so the effect doesn't run on every toggle and re-expand what the user
  // just collapsed on the same page; only a navigation to a different feature triggers it.
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

  // A filtered branch has to be forced open, or the very thing a search found stays
  // hidden inside a folder collapsed before the search began.
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
    // A filtered view is a search result, not a place to reorganise from.
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
      // Forced open by search; toggling shouldn't fight that or be persisted.
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

  // The sync data loader reads `dataLoader` fresh each render but only recomputes its view
  // on request; this makes that request when the list or search changes. `tree` itself is
  // a new object every render, so it can't be a dependency — `nodeById` already changes
  // exactly when this data does.
  useEffect(() => {
    tree.scheduleRebuildTree()
  }, [nodeById])

  const items = tree.getItems()

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Only the lockup links home; the name below is information, not navigation.
                No alt text on the images, so the link keeps its explicit "chocks" name. */}
            <div className="flex flex-col items-start gap-1.5 px-3 pt-4 pb-2">
              <Link to="/" aria-label="chocks">
                {/* Light and dark variants; the theme shows one. */}
                <img src="/chocks_lockup_onlight.svg" alt="" className="h-8 w-auto dark:hidden" />
                <img
                  src="/chocks_lockup_ondark.svg"
                  alt=""
                  className="hidden h-8 w-auto dark:block"
                />
              </Link>
              <span className="text-sidebar-foreground/60 max-w-full truncate text-xs">
                {workspace.data?.name ?? '…'}
              </span>
            </div>
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
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New feature"
                  onClick={() => setDialogOpen(true)}
                />
              }
            >
              <Plus />
            </TooltipTrigger>
            {/* Same wording as the button's accessible name, so the two agree. */}
            <TooltipContent side="bottom">New feature</TooltipContent>
          </Tooltip>
        </div>

        {/* Filtering silently prunes the tree, which a screen reader user needs told
            about. Rendered unconditionally: one added already-populated announces
            nothing. */}
        <div className="px-3 pb-1">
          <span
            role="status"
            aria-live="polite"
            aria-label="Search results"
            className="text-sidebar-foreground/60 text-xs"
          >
            {filtering &&
              `${filtered.matchedIds.size} ${filtered.matchedIds.size === 1 ? 'match' : 'matches'}`}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="min-h-0 flex-1">
          <SidebarGroupLabel>Features</SidebarGroupLabel>
          <SidebarGroupContent>
            {/* A sibling, not a child: role="tree" only permits treeitem and group
                children, and axe flags this as critical if it lands inside. */}
            <AssistiveTreeDescription tree={tree} />
            <Tree indent={INDENT_WIDTH} tree={tree}>
              {items.map((item) => {
                const feature = item.getItemData()
                const isFolder = item.isFolder()
                const isActive = featureKey(feature) === currentKey
                const matched = !filtering || filtered.matchedIds.has(feature.id)
                // True when hovering would make this row the new parent; sibling
                // reorders show via the drag line instead.
                const isDropTarget = item.isDragTarget()

                return (
                  <TreeItem
                    key={item.getId()}
                    item={item}
                    render={<div />}
                    // One line per level, scoped to this row's own indent rather than the
                    // tree's deepest branch. Centred in each indent-wide segment so it
                    // lines up with the ancestor's chevron.
                    className="relative before:absolute before:inset-y-0 before:start-0 before:w-(--tree-padding) before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)/2-0.5px),var(--sidebar-border)_calc(var(--tree-indent)/2-0.5px),var(--sidebar-border)_calc(var(--tree-indent)/2+0.5px),transparent_calc(var(--tree-indent)/2+0.5px),transparent_var(--tree-indent))]"
                  >
                    <div
                      className={cn(
                        'group/row flex items-center gap-1 rounded-md pe-1 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        // TreeItem sets outline-hidden on the focusable ancestor (its box
                        // spans the indentation), so the ring is drawn here instead,
                        // around the visible row.
                        'in-focus-visible:ring-2 in-focus-visible:ring-sidebar-ring',
                        (isActive || isDropTarget) &&
                          'bg-sidebar-accent text-sidebar-accent-foreground',
                        !matched && 'opacity-55',
                        !filtering && 'cursor-grab',
                      )}
                    >
                      <button
                        type="button"
                        // Not a tab stop (arrow keys expand the focused row) but still
                        // named for touch and screen-reader users.
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
                        // The row's own click selects and toggles folders; a title click is
                        // "navigate" only, so don't let it also silently flip this entry's
                        // expansion behind you.
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
        {/* /40 is 2.69:1 against the sidebar, under the 4.5:1 this size needs; /60 matches
            the group label above. */}
        <div className="text-sidebar-foreground/60 px-3 py-2 text-xs">
          {workspace.data?.version && `Chocks v${workspace.data.version}`}
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
