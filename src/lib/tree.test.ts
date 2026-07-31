import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  buildTree,
  canMove,
  collectExpandableIds,
  filterTree,
  flattenVisible,
  indexAfter,
  projectDrop,
  siblingsOf,
  sortKeyBetween,
  sortKeyForIndex,
  subtreeIds,
  type TreeNode,
} from './tree'
import type { Feature } from './types'

function feature(
  id: string,
  parent: string,
  sort: string,
  overrides: Partial<Feature> = {},
): Feature {
  return {
    id,
    uid: id.replace(/[^a-z0-9]/g, '') + '00',
    parent,
    title: id,
    description: '',
    status: 'planned',
    tags: [],
    sort,
    ...overrides,
  }
}

/** Renders a tree as indented ids so assertions read like the thing being described. */
function shape(nodes: TreeNode[], indent = 0): string[] {
  return nodes.flatMap((node) => [
    `${'  '.repeat(indent)}${node.feature.id}`,
    ...shape(node.children, indent + 1),
  ])
}

describe('buildTree', () => {
  it('returns nothing for an empty list', () => {
    expect(buildTree([])).toEqual([])
  })

  it('orders siblings by fractional index key, not insertion order', () => {
    const features = [feature('c', '', 'a2'), feature('a', '', 'a0'), feature('b', '', 'a1')]
    expect(shape(buildTree(features))).toEqual(['a', 'b', 'c'])
  })

  it('nests children and assigns depth', () => {
    const features = [
      feature('root', '', 'a0'),
      feature('child', 'root', 'a0'),
      feature('grandchild', 'child', 'a0'),
    ]
    const tree = buildTree(features)
    expect(shape(tree)).toEqual(['root', '  child', '    grandchild'])
    expect(tree[0]!.depth).toBe(0)
    expect(tree[0]!.children[0]!.depth).toBe(1)
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2)
  })

  it('promotes orphans to roots rather than dropping them', () => {
    // `parent` points at a feature that is not in the list — e.g. a partial fetch.
    const features = [feature('a', '', 'a0'), feature('orphan', 'missing', 'a1')]
    expect(shape(buildTree(features))).toEqual(['a', 'orphan'])
  })

  it('surfaces cyclic features as roots rather than losing them', () => {
    // Both point at each other, so neither is reachable from the root. They must still
    // terminate, and must still be rendered — otherwise the data is invisible and the
    // user has no way to repair it.
    const features = [feature('x', 'y', 'a0'), feature('y', 'x', 'a0')]
    expect(() => buildTree(features)).not.toThrow()
    const ids = shape(buildTree(features)).map((line) => line.trim())
    expect(ids).toContain('x')
    expect(ids).toContain('y')
  })

  it('does not duplicate features when recovering from a cycle', () => {
    const features = [
      feature('a', '', 'a0'),
      feature('x', 'y', 'a0'),
      feature('y', 'x', 'a0'),
      feature('z', 'x', 'a0'),
    ]
    const ids = shape(buildTree(features)).map((line) => line.trim())
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual(['a', 'x', 'y', 'z'])
  })

  it('breaks a tie on equal sort keys deterministically', () => {
    const forwards = buildTree([feature('b', '', 'a0'), feature('a', '', 'a0')])
    const backwards = buildTree([feature('a', '', 'a0'), feature('b', '', 'a0')])
    expect(shape(forwards)).toEqual(['a', 'b'])
    expect(shape(backwards)).toEqual(['a', 'b'])
  })
})

describe('filterTree', () => {
  const features = [
    feature('auth', '', 'a0', { title: 'Auth' }),
    feature('oauth', 'auth', 'a0', { title: 'OAuth' }),
    feature('github', 'oauth', 'a0', { title: 'GitHub provider', status: 'done' }),
    feature('google', 'oauth', 'a1', { title: 'Google provider' }),
    feature('billing', '', 'a1', { title: 'Billing', tags: ['t1'] }),
  ]
  const tree = buildTree(features)

  it('returns the tree untouched when no filter is active', () => {
    const result = filterTree(tree, { query: '', statuses: [], tags: [] })
    expect(result.nodes).toBe(tree)
    expect(result.matchedIds.size).toBe(0)
  })

  it('keeps ancestors of a match so the result is still navigable', () => {
    const result = filterTree(tree, { query: 'github', statuses: [], tags: [] })
    expect(shape(result.nodes)).toEqual(['auth', '  oauth', '    github'])
    expect([...result.matchedIds]).toEqual(['github'])
    expect([...result.ancestorIds].sort()).toEqual(['auth', 'oauth'])
  })

  it('drops branches with no match anywhere', () => {
    const result = filterTree(tree, { query: 'billing', statuses: [], tags: [] })
    expect(shape(result.nodes)).toEqual(['billing'])
  })

  it('drops non-matching descendants of a match', () => {
    // 'OAuth' matches; its children do not, so they are pruned.
    const result = filterTree(tree, { query: 'oauth', statuses: [], tags: [] })
    expect(shape(result.nodes)).toEqual(['auth', '  oauth'])
  })

  it('matches case-insensitively and searches the description', () => {
    const withDescription = buildTree([
      feature('a', '', 'a0', { title: 'Nothing', description: 'Handles WEBHOOK retries' }),
    ])
    const result = filterTree(withDescription, { query: 'webhook', statuses: [], tags: [] })
    expect(shape(result.nodes)).toEqual(['a'])
  })

  it('filters by status', () => {
    const result = filterTree(tree, { query: '', statuses: ['done'], tags: [] })
    expect(shape(result.nodes)).toEqual(['auth', '  oauth', '    github'])
    expect([...result.matchedIds]).toEqual(['github'])
  })

  it('filters by tag', () => {
    const result = filterTree(tree, { query: '', statuses: [], tags: ['t1'] })
    expect(shape(result.nodes)).toEqual(['billing'])
  })

  it('combines filters with AND', () => {
    // 'provider' matches two features, but only one is done.
    const result = filterTree(tree, { query: 'provider', statuses: ['done'], tags: [] })
    expect([...result.matchedIds]).toEqual(['github'])
  })

  it('returns an empty tree when nothing matches', () => {
    const result = filterTree(tree, { query: 'nonexistent', statuses: [], tags: [] })
    expect(result.nodes).toEqual([])
  })
})

describe('flattenVisible', () => {
  const tree = buildTree([
    feature('a', '', 'a0'),
    feature('a1', 'a', 'a0'),
    feature('a1a', 'a1', 'a0'),
    feature('b', '', 'a1'),
  ])

  it('hides children of collapsed nodes', () => {
    const rows = flattenVisible(tree, new Set())
    expect(rows.map((row) => row.feature.id)).toEqual(['a', 'b'])
    expect(rows[0]!.hasChildren).toBe(true)
    expect(rows[0]!.expanded).toBe(false)
  })

  it('reveals one level per expanded ancestor', () => {
    expect(flattenVisible(tree, new Set(['a'])).map((r) => r.feature.id)).toEqual(['a', 'a1', 'b'])
    expect(flattenVisible(tree, new Set(['a', 'a1'])).map((r) => r.feature.id)).toEqual([
      'a',
      'a1',
      'a1a',
      'b',
    ])
  })

  it('ignores expansion of a leaf', () => {
    const rows = flattenVisible(tree, new Set(['b']))
    expect(rows.find((row) => row.feature.id === 'b')!.expanded).toBe(false)
  })
})

describe('collectExpandableIds', () => {
  it('lists only nodes that have children', () => {
    const tree = buildTree([
      feature('a', '', 'a0'),
      feature('a1', 'a', 'a0'),
      feature('leaf', '', 'a1'),
    ])
    expect([...collectExpandableIds(tree)]).toEqual(['a'])
  })
})

describe('canMove', () => {
  const features = [
    feature('root', '', 'a0'),
    feature('child', 'root', 'a0'),
    feature('grandchild', 'child', 'a0'),
    feature('other', '', 'a1'),
  ]

  it('refuses to move a feature onto itself', () => {
    expect(canMove(features, 'root', 'root')).toBe(false)
  })

  it('refuses to move a feature under its own child', () => {
    expect(canMove(features, 'root', 'child')).toBe(false)
  })

  it('refuses to move a feature under its own grandchild', () => {
    expect(canMove(features, 'root', 'grandchild')).toBe(false)
  })

  it('allows moving under an unrelated feature', () => {
    expect(canMove(features, 'root', 'other')).toBe(true)
    expect(canMove(features, 'grandchild', 'other')).toBe(true)
  })

  it('allows moving to the root', () => {
    expect(canMove(features, 'grandchild', '')).toBe(true)
  })

  it('refuses a target that does not exist', () => {
    expect(canMove(features, 'root', 'missing')).toBe(false)
  })

  it('refuses rather than hanging on pre-existing cycle data', () => {
    const cyclic = [feature('x', 'y', 'a0'), feature('y', 'x', 'a0'), feature('z', '', 'a0')]
    expect(canMove(cyclic, 'z', 'x')).toBe(false)
  })
})

describe('sortKeyBetween', () => {
  it('generates a key when there are no neighbours', () => {
    expect(sortKeyBetween(null, null)).toBeTruthy()
  })

  it('orders strictly between two neighbours', () => {
    const first = sortKeyBetween(null, null)
    const last = sortKeyBetween(first, null)
    const middle = sortKeyBetween(first, last)
    expect(first < middle).toBe(true)
    expect(middle < last).toBe(true)
  })

  it('stays ordered after repeated insertion at the same position', () => {
    // The failure mode this guards against is float-based ordering losing precision.
    let low = sortKeyBetween(null, null)
    const high = sortKeyBetween(low, null)
    const inserted: string[] = []
    for (let i = 0; i < 60; i++) {
      const key = sortKeyBetween(low, high)
      inserted.push(key)
      low = key
    }
    expect([...inserted].sort()).toEqual(inserted)
    expect(new Set(inserted).size).toBe(inserted.length)
    expect(inserted.every((key) => key < high)).toBe(true)
  })
})

describe('sortKeyForIndex', () => {
  const siblings = [feature('a', '', 'a0'), feature('b', '', 'a1'), feature('c', '', 'a2')]

  it('places a feature first', () => {
    expect(sortKeyForIndex(siblings, 0) < 'a0').toBe(true)
  })

  it('places a feature last', () => {
    expect(sortKeyForIndex(siblings, 3) > 'a2').toBe(true)
  })

  it('places a feature between two siblings', () => {
    const key = sortKeyForIndex(siblings, 1)
    expect(key > 'a0').toBe(true)
    expect(key < 'a1').toBe(true)
  })

  it('clamps an out-of-range index instead of throwing', () => {
    expect(sortKeyForIndex(siblings, 99) > 'a2').toBe(true)
    expect(sortKeyForIndex(siblings, -5) < 'a0').toBe(true)
  })

  it('handles an empty sibling list', () => {
    expect(sortKeyForIndex([], 0)).toBeTruthy()
  })
})

describe('siblingsOf', () => {
  it('returns direct children in display order', () => {
    const features = [
      feature('b', 'p', 'a1'),
      feature('a', 'p', 'a0'),
      feature('elsewhere', 'q', 'a0'),
    ]
    expect(siblingsOf(features, 'p').map((f) => f.id)).toEqual(['a', 'b'])
  })

  it('returns roots for the empty parent', () => {
    const features = [feature('root', '', 'a0'), feature('child', 'root', 'a0')]
    expect(siblingsOf(features, '').map((f) => f.id)).toEqual(['root'])
  })
})

describe('ancestorsOf', () => {
  const features = [
    feature('root', '', 'a0'),
    feature('child', 'root', 'a0'),
    feature('grandchild', 'child', 'a0'),
    feature('other', '', 'a1'),
  ]

  it('returns the chain outermost first', () => {
    expect(ancestorsOf(features, 'grandchild').map((f) => f.id)).toEqual(['root', 'child'])
  })

  it('returns nothing for a root feature', () => {
    expect(ancestorsOf(features, 'root')).toEqual([])
  })

  it('returns nothing for an unknown feature', () => {
    expect(ancestorsOf(features, 'missing')).toEqual([])
  })

  it('stops at a parent that is not loaded', () => {
    const partial = [feature('orphan', 'absent', 'a0')]
    expect(ancestorsOf(partial, 'orphan')).toEqual([])
  })

  it('terminates on cyclic data', () => {
    const cyclic = [feature('x', 'y', 'a0'), feature('y', 'x', 'a0')]
    expect(() => ancestorsOf(cyclic, 'x')).not.toThrow()
    expect(ancestorsOf(cyclic, 'x').length).toBeLessThanOrEqual(2)
  })
})

describe('subtreeIds', () => {
  const features = [
    feature('root', '', 'a0'),
    feature('child', 'root', 'a0'),
    feature('grandchild', 'child', 'a0'),
    feature('other', '', 'a1'),
  ]

  it('includes the feature and every descendant', () => {
    expect(subtreeIds(features, 'root').sort()).toEqual(['child', 'grandchild', 'root'])
  })

  it('returns just the feature for a leaf', () => {
    expect(subtreeIds(features, 'other')).toEqual(['other'])
  })
})

describe('projectDrop', () => {
  //  a
  //    a1
  //    a2
  //  b
  const features = [
    feature('a', '', 'a0'),
    feature('a1', 'a', 'a0'),
    feature('a2', 'a', 'a1'),
    feature('b', '', 'a1'),
  ]
  const rows = flattenVisible(buildTree(features), new Set(['a']))

  it('returns null for an unknown feature', () => {
    expect(projectDrop(rows, 'nope', 1, 0)).toBeNull()
  })

  it('reorders within the same parent', () => {
    // Move a2 up one slot, no horizontal movement.
    const result = projectDrop(rows, 'a2', 1, 0)
    expect(result).toEqual({ parentId: 'a', depth: 1, afterId: null })
  })

  it('indents one level to become a sibling of the rows above', () => {
    // b sits at depth 0 below a2 (depth 1); one indent makes it a's third child.
    const result = projectDrop(rows, 'b', 3, 1)
    expect(result?.parentId).toBe('a')
    expect(result?.depth).toBe(1)
  })

  it('indents two levels to become a child of the row above', () => {
    const result = projectDrop(rows, 'b', 3, 2)
    expect(result?.parentId).toBe('a2')
    expect(result?.depth).toBe(2)
  })

  it('outdents to the root when dragged left', () => {
    const result = projectDrop(rows, 'a2', 2, -1)
    expect(result?.parentId).toBe('')
    expect(result?.depth).toBe(0)
  })

  it('cannot indent more than one level below the row above', () => {
    const result = projectDrop(rows, 'b', 3, 5)
    expect(result?.depth).toBe(2) // a2 is at depth 1, so 2 is the ceiling
  })

  it('cannot outdent past the row below', () => {
    // Dropping above a1 (depth 1) means the result cannot be shallower than depth 1.
    const result = projectDrop(rows, 'b', 1, -5)
    expect(result?.depth).toBe(1)
  })

  it('reports the sibling to follow, ignoring the dragged row', () => {
    const result = projectDrop(rows, 'a1', 2, 0)
    expect(result?.parentId).toBe('a')
    expect(result?.afterId).toBe('a2')
  })

  it('drops at the top of the list', () => {
    const result = projectDrop(rows, 'b', 0, 0)
    expect(result).toEqual({ parentId: '', depth: 0, afterId: null })
  })
})

describe('indexAfter', () => {
  const siblings = [feature('a', 'p', 'a0'), feature('b', 'p', 'a1')]

  it('places first when there is nothing to follow', () => {
    expect(indexAfter(siblings, null)).toBe(0)
  })

  it('places directly after the named sibling', () => {
    expect(indexAfter(siblings, 'a')).toBe(1)
    expect(indexAfter(siblings, 'b')).toBe(2)
  })

  it('appends when the sibling is not in the list', () => {
    // Can happen if the sibling was collapsed away or deleted concurrently.
    expect(indexAfter(siblings, 'ghost')).toBe(2)
  })
})

describe('drag projection feeds a valid move', () => {
  it('never projects a drop that canMove would reject', () => {
    const features = [
      feature('root', '', 'a0'),
      feature('child', 'root', 'a0'),
      feature('grandchild', 'child', 'a0'),
    ]
    const rows = flattenVisible(buildTree(features), new Set(['root', 'child']))
    // Try every slot and depth for the root; none may land inside its own subtree.
    for (let overIndex = 0; overIndex < rows.length; overIndex++) {
      for (let delta = -3; delta <= 3; delta++) {
        const projection = projectDrop(rows, 'root', overIndex, delta)
        if (!projection) continue
        expect(canMove(features, 'root', projection.parentId)).toBe(true)
      }
    }
  })
})

describe('status typing', () => {
  it('accepts every schema status', () => {
    const statuses: string[] = ['planned', 'in-progress', 'done', 'dropped']
    const tree = buildTree(statuses.map((s, i) => feature(s, '', `a${i}`, { status: s })))
    expect(tree).toHaveLength(4)
  })
})
