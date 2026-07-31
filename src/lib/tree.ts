import { generateKeyBetween } from 'fractional-indexing'
import { slugFromKey, slugOf, uidFromKey } from './ids'
import type { Feature } from './types'

export interface TreeNode {
  feature: Feature
  children: TreeNode[]
  /** 0 for roots. */
  depth: number
}

export const ROOT_PARENT = ''

/**
 * Compares two fractional index keys.
 *
 * Deliberately a plain code-unit comparison rather than localeCompare — the keys are
 * ASCII base-62 and locale-aware collation would reorder them.
 */
function compareSortKeys(a: Feature, b: Feature): number {
  if (a.sort !== b.sort) return a.sort < b.sort ? -1 : 1
  // Stable tiebreak so equal keys (possible after a bad write) never reorder on rerender.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Builds a nested tree from a flat feature list.
 *
 * Features whose `parent` is missing from the list are treated as roots, so a partial
 * fetch degrades to a flat list instead of silently dropping rows.
 *
 * Cycles should be impossible — `canMove` rejects them before any write — but could still
 * arrive from a hand-edited database. Rather than recursing forever, or dropping the
 * cyclic records so they become invisible and therefore unfixable, members of a cycle are
 * surfaced as roots.
 */
export function buildTree(features: Feature[]): TreeNode[] {
  const byId = new Map<string, Feature>()
  for (const feature of features) byId.set(feature.id, feature)

  const childrenOf = new Map<string, Feature[]>()
  for (const feature of features) {
    const parentId = feature.parent && byId.has(feature.parent) ? feature.parent : ROOT_PARENT
    const siblings = childrenOf.get(parentId)
    if (siblings) siblings.push(feature)
    else childrenOf.set(parentId, [feature])
  }
  for (const siblings of childrenOf.values()) siblings.sort(compareSortKeys)

  const visited = new Set<string>()

  function build(parentId: string, depth: number): TreeNode[] {
    const siblings = childrenOf.get(parentId)
    if (!siblings) return []
    const nodes: TreeNode[] = []
    for (const feature of siblings) {
      if (visited.has(feature.id)) continue // cycle guard
      visited.add(feature.id)
      nodes.push({ feature, children: build(feature.id, depth + 1), depth })
    }
    return nodes
  }

  const roots = build(ROOT_PARENT, 0)

  // Anything still unvisited is part of a cycle. Surface it at the root so it stays
  // visible and editable instead of disappearing.
  for (const feature of features) {
    if (visited.has(feature.id)) continue
    visited.add(feature.id)
    roots.push({ feature, children: build(feature.id, 1), depth: 0 })
  }

  return roots
}

export interface TreeFilters {
  /** Free text matched against title and description, case-insensitively. */
  query: string
  /** Empty means "any status". */
  statuses: string[]
  /** Empty means "any tag". A feature matches if it carries at least one listed tag. */
  tags: string[]
}

export const EMPTY_FILTERS: TreeFilters = { query: '', statuses: [], tags: [] }

export function isFiltering(filters: TreeFilters): boolean {
  return filters.query.trim() !== '' || filters.statuses.length > 0 || filters.tags.length > 0
}

export interface FilterResult {
  /** Pruned tree containing matches and the ancestors needed to reach them. */
  nodes: TreeNode[]
  /** Features that matched the filters directly — highlight these. */
  matchedIds: Set<string>
  /** Features retained only as context for a matching descendant — dim these. */
  ancestorIds: Set<string>
}

function matches(feature: Feature, filters: TreeFilters, query: string): boolean {
  if (query && !`${feature.title}\n${feature.description}`.toLowerCase().includes(query)) {
    return false
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes(feature.status)) return false
  if (filters.tags.length > 0 && !feature.tags.some((tag) => filters.tags.includes(tag))) {
    return false
  }
  return true
}

/**
 * Prunes a tree to the features matching `filters`, keeping every ancestor of a match so
 * the result is still a navigable tree.
 *
 * Non-matching *descendants* of a match are dropped. Keeping them would mean a broad
 * query re-expands most of the tree, which defeats the point of filtering.
 */
export function filterTree(nodes: TreeNode[], filters: TreeFilters): FilterResult {
  const matchedIds = new Set<string>()
  const ancestorIds = new Set<string>()

  if (!isFiltering(filters)) {
    return { nodes, matchedIds, ancestorIds }
  }

  const query = filters.query.trim().toLowerCase()

  function walk(input: TreeNode[]): TreeNode[] {
    const kept: TreeNode[] = []
    for (const node of input) {
      const children = walk(node.children)
      const selfMatches = matches(node.feature, filters, query)
      if (selfMatches) matchedIds.add(node.feature.id)
      else if (children.length > 0) ancestorIds.add(node.feature.id)

      if (selfMatches || children.length > 0) {
        kept.push({ ...node, children })
      }
    }
    return kept
  }

  return { nodes: walk(nodes), matchedIds, ancestorIds }
}

/** Every ancestor id of the given features, for auto-expanding a filtered tree. */
export function collectExpandableIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>()
  function walk(input: TreeNode[]) {
    for (const node of input) {
      if (node.children.length > 0) {
        ids.add(node.feature.id)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return ids
}

export interface FlatRow {
  feature: Feature
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/** Flattens a tree to the rows that should actually render, honouring collapsed nodes. */
export function flattenVisible(nodes: TreeNode[], expandedIds: ReadonlySet<string>): FlatRow[] {
  const rows: FlatRow[] = []
  function walk(input: TreeNode[]) {
    for (const node of input) {
      const hasChildren = node.children.length > 0
      const expanded = hasChildren && expandedIds.has(node.feature.id)
      rows.push({ feature: node.feature, depth: node.depth, hasChildren, expanded })
      if (expanded) walk(node.children)
    }
  }
  walk(nodes)
  return rows
}

export interface DropProjection {
  parentId: string
  depth: number
  /** Sibling the dragged feature should follow; null means "first child". */
  afterId: string | null
}

/**
 * Works out where a drag would actually land.
 *
 * Vertical position picks the slot; horizontal drag distance picks the depth, clamped to
 * what the neighbouring rows allow — you cannot indent deeper than one level below the row
 * above, nor outdent past the row below.
 *
 * Returns `afterId` rather than a numeric index because `rows` contains only *visible*
 * rows: dropping next to a collapsed parent must still resolve against that parent's real
 * children, which the caller looks up from the full list.
 *
 * The dragged feature's own descendants are removed before projecting, so no combination
 * of position and depth can propose moving a feature inside itself. `overIndex` is
 * therefore an index into the list *without* that subtree, which is also what the tree
 * renders mid-drag.
 */
export function projectDrop(
  rows: FlatRow[],
  activeId: string,
  overIndex: number,
  depthDelta: number,
): DropProjection | null {
  const activeIndex = rows.findIndex((row) => row.feature.id === activeId)
  const activeRow = rows[activeIndex]
  if (!activeRow) return null

  // Descendants are the contiguous run of deeper rows directly after the dragged row.
  let subtreeEnd = activeIndex + 1
  while (subtreeEnd < rows.length && (rows[subtreeEnd]?.depth ?? 0) > activeRow.depth) {
    subtreeEnd++
  }
  const others = [...rows.slice(0, activeIndex), ...rows.slice(subtreeEnd)]

  const target = Math.max(0, Math.min(overIndex, others.length))
  const reordered = [...others.slice(0, target), activeRow, ...others.slice(target)]

  const previous = reordered[target - 1]
  const next = reordered[target + 1]

  const maxDepth = previous ? previous.depth + 1 : 0
  const minDepth = next ? next.depth : 0
  const depth = Math.max(minDepth, Math.min(activeRow.depth + depthDelta, maxDepth))

  let parentId: string
  if (depth === 0 || !previous) {
    parentId = ROOT_PARENT
  } else if (depth > previous.depth) {
    parentId = previous.feature.id
  } else if (depth === previous.depth) {
    parentId = previous.feature.parent || ROOT_PARENT
  } else {
    // Outdenting: adopt the parent of the nearest earlier row sitting at the target depth.
    const ancestor = reordered
      .slice(0, target)
      .reverse()
      .find((row) => row.depth === depth)
    parentId = ancestor ? ancestor.feature.parent || ROOT_PARENT : ROOT_PARENT
  }

  let afterId: string | null = null
  for (let index = 0; index < target; index++) {
    const row = reordered[index]
    if (!row || row.feature.id === activeId) continue
    if ((row.feature.parent || ROOT_PARENT) === parentId) afterId = row.feature.id
  }

  return { parentId, depth, afterId }
}

/** Visible rows minus the dragged feature's descendants — what the tree renders mid-drag. */
export function rowsExcludingSubtree(rows: FlatRow[], activeId: string): FlatRow[] {
  const activeIndex = rows.findIndex((row) => row.feature.id === activeId)
  const activeRow = rows[activeIndex]
  if (!activeRow) return rows
  let end = activeIndex + 1
  while (end < rows.length && (rows[end]?.depth ?? 0) > activeRow.depth) end++
  return [...rows.slice(0, activeIndex + 1), ...rows.slice(end)]
}

/** Position `afterId` implies within `siblings` (which must exclude the moved feature). */
export function indexAfter(siblings: Feature[], afterId: string | null): number {
  if (afterId === null) return 0
  const position = siblings.findIndex((feature) => feature.id === afterId)
  return position === -1 ? siblings.length : position + 1
}

/**
 * True when `featureId` may be reparented under `newParentId`.
 *
 * Walks up from the target: if we reach the dragged feature, the move would close a cycle.
 * PocketBase would happily store that — nothing in the schema prevents it — so the check
 * has to happen here, before the write.
 */
export function canMove(features: Feature[], featureId: string, newParentId: string): boolean {
  if (newParentId === ROOT_PARENT) return true
  if (featureId === newParentId) return false

  const byId = new Map(features.map((feature) => [feature.id, feature]))
  if (!byId.has(newParentId)) return false

  const seen = new Set<string>()
  let cursor: string | undefined = newParentId
  while (cursor && cursor !== ROOT_PARENT) {
    if (cursor === featureId) return false
    if (seen.has(cursor)) return false // pre-existing cycle; refuse rather than loop
    seen.add(cursor)
    cursor = byId.get(cursor)?.parent
  }
  return true
}

/**
 * Generates a sort key ordering a feature between two siblings.
 *
 * Pass null for `prev` to place first, null for `next` to place last.
 */
export function sortKeyBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next)
}

/**
 * Sort key placing a feature at `index` within `siblings` (already in display order).
 *
 * `siblings` must exclude the feature being moved, otherwise it would be compared
 * against its own current key and could produce a no-op move.
 */
export function sortKeyForIndex(siblings: Feature[], index: number): string {
  const clamped = Math.max(0, Math.min(index, siblings.length))
  const prev = clamped > 0 ? (siblings[clamped - 1]?.sort ?? null) : null
  const next = clamped < siblings.length ? (siblings[clamped]?.sort ?? null) : null
  return sortKeyBetween(prev, next)
}

/** Direct children of `parentId`, in display order. */
export function siblingsOf(features: Feature[], parentId: string): Feature[] {
  return features
    .filter((feature) => (feature.parent || ROOT_PARENT) === parentId)
    .sort(compareSortKeys)
}

/**
 * The chain of ancestors above a feature, outermost first — the breadcrumb trail.
 *
 * Stops at a missing parent rather than failing, so a partially loaded list still yields
 * the part of the path it can prove.
 */
/**
 * Resolves a URL key to a feature.
 *
 * Prefers the uid, which survives renames and moves, and falls back to matching the final
 * path segment for links written before the feature had a uid.
 */
export function findByKey(features: Feature[], key: string): Feature | undefined {
  const uid = uidFromKey(key)
  if (uid !== null) {
    const match = features.find((feature) => feature.uid === uid)
    if (match) return match
  }
  const slug = slugFromKey(key)
  return features.find((feature) => slugOf(feature.id) === slug)
}

export function ancestorsOf(features: Feature[], featureId: string): Feature[] {
  const byId = new Map(features.map((feature) => [feature.id, feature]))
  const chain: Feature[] = []
  const seen = new Set<string>([featureId])

  let cursor = byId.get(featureId)?.parent
  while (cursor && cursor !== ROOT_PARENT) {
    if (seen.has(cursor)) break // cycle; return what we have
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    chain.push(parent)
    cursor = parent.parent
  }

  return chain.reverse()
}

/** The feature and all of its descendants — used for delete confirmation counts. */
export function subtreeIds(features: Feature[], featureId: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const feature of features) {
    const parentId = feature.parent || ROOT_PARENT
    const ids = childrenOf.get(parentId)
    if (ids) ids.push(feature.id)
    else childrenOf.set(parentId, [feature.id])
  }

  const collected: string[] = []
  const queue = [featureId]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    collected.push(id)
    queue.push(...(childrenOf.get(id) ?? []))
  }
  return collected
}
