import { toast } from 'sonner'
import { api } from './api'
import { childrenOf, indexAfter } from '@/lib/tree'
import { joinId, slugOf } from '@/lib/ids'
import type { Feature, FeatureCodeRef, FeatureLink, Importance } from '@/lib/types'

/**
 * Reversing what the UI just did.
 *
 * chocks keeps no history of its own — the repo does that. This is the smaller thing: a
 * way back from the edit you regret a second later, which lasts as long as the tab does
 * and no longer.
 *
 * Entries are plain data rather than closures, so the stack can be written to
 * sessionStorage and survive a refresh. They refer to features by `uid`: ids are paths, so
 * a rename or a move changes them, and changes them for every descendant too. A uid is the
 * only handle that survives the operations undo has to reverse.
 */

/**
 * A feature as it was.
 *
 * The id is left out because it is a path and a path moves. The slug is kept, because a
 * hand-written file's name need not match its title, and restoring it under a name derived
 * from the title would rename it behind the user's back.
 */
export interface Snapshot {
  uid: string
  title: string
  description: string
  status: string
  importance?: Importance
  tags: string[]
  links: FeatureLink[]
  code: FeatureCodeRef[]
  sort: string
  slug: string
  /** Null for a feature at the root. */
  parentUid: string | null
}

/**
 * What happened, named once and carried both ways.
 *
 * `label` describes the original action rather than what the entry does, so undo and redo
 * read as two sides of one thing: "Undid: created Auth", then "Redid: created Auth".
 */
export type UndoEntry =
  | { kind: 'created'; label: string; uid: string }
  | { kind: 'updated'; label: string; before: Snapshot }
  | { kind: 'moved'; label: string; before: Snapshot }
  | { kind: 'deleted'; label: string; subtree: Snapshot[] }
  /** The other side of a delete: it is back, and can be taken away again. */
  | { kind: 'restored'; label: string; uid: string }

export class StaleUndoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaleUndoError'
  }
}

/** Uids the entry needs to still find, checked before anything is written. */
export function touchedUids(entry: UndoEntry): string[] {
  switch (entry.kind) {
    case 'created':
    case 'restored':
      return [entry.uid]
    case 'updated':
    case 'moved':
      return [entry.before.uid]
    // The features are gone, so there is nothing to look for. The parent is checked as the
    // restore walks, and a missing one fails before anything is written.
    case 'deleted':
      return []
  }
}

/** Where a feature is now, found by the one identifier that survives being moved. */
function byUid(features: Feature[], uid: string): Feature {
  const found = features.find((feature) => feature.uid === uid)
  if (!found) throw new StaleUndoError('that feature is no longer here')
  return found
}

/** '' for a root feature, since the store spells the root that way. */
function parentIdOf(features: Feature[], parentUid: string | null): string {
  if (parentUid === null) return ''
  return byUid(features, parentUid).id
}

export function snapshot(features: Feature[], feature: Feature): Snapshot {
  const parent = features.find((other) => other.id === feature.parent)
  return {
    uid: feature.uid,
    title: feature.title,
    description: feature.description,
    status: feature.status,
    ...(feature.importance !== undefined ? { importance: feature.importance } : {}),
    tags: feature.tags,
    links: feature.links,
    code: feature.code,
    sort: feature.sort,
    slug: slugOf(feature.id),
    parentUid: parent?.uid ?? null,
  }
}

/** A feature and everything under it, parents first, ready to be written back. */
export function subtreeSnapshot(features: Feature[], feature: Feature): Snapshot[] {
  const collected: Snapshot[] = []
  const walk = (current: Feature) => {
    collected.push(snapshot(features, current))
    for (const child of childrenOf(features, current.id)) walk(child)
  }
  walk(feature)
  return collected
}

export const createdEntry = (created: Feature): UndoEntry => ({
  kind: 'created',
  label: `created ${created.title}`,
  uid: created.uid,
})

export const updatedEntry = (before: Feature, features: Feature[]): UndoEntry => ({
  kind: 'updated',
  label: `edited ${before.title}`,
  before: snapshot(features, before),
})

export const movedEntry = (before: Feature, features: Feature[]): UndoEntry => ({
  kind: 'moved',
  label: `moved ${before.title}`,
  before: snapshot(features, before),
})

export const deletedEntry = (subtree: Snapshot[], label?: string): UndoEntry => ({
  kind: 'deleted',
  label: label ?? (subtree[0] ? `deleted ${subtree[0].title}` : 'deleted a feature'),
  subtree,
})

/**
 * Reverses one entry and hands back the entry that would reverse it in turn.
 *
 * `features` is the tree as it is right now, read fresh, because files change on disk from
 * the user's editor at any time.
 */
export async function applyEntry(entry: UndoEntry, features: Feature[]): Promise<UndoEntry> {
  switch (entry.kind) {
    case 'created': {
      const current = byUid(features, entry.uid)
      // Deliberately does not take anything added underneath since. Deleting takes the
      // subtree with it, and quietly discarding someone's later work is worse than
      // refusing.
      if (childrenOf(features, current.id).length > 0) {
        throw new StaleUndoError('it has sub-features now, so undoing would delete them')
      }
      const captured = snapshot(features, current)
      await api.deleteFeature(current.id)
      return deletedEntry([captured], entry.label)
    }

    case 'updated': {
      const current = byUid(features, entry.before.uid)
      const redo = updatedEntry(current, features)
      await api.updateFeature(current.id, {
        title: entry.before.title,
        status: entry.before.status,
        tags: entry.before.tags,
        links: entry.before.links,
        code: entry.before.code,
        description: entry.before.description,
      })
      return { ...redo, label: entry.label }
    }

    case 'moved': {
      const current = byUid(features, entry.before.uid)
      const redo = movedEntry(current, features)
      const parentId = parentIdOf(features, entry.before.parentUid)
      const siblings = childrenOf(features, parentId).filter(
        (feature) => feature.uid !== entry.before.uid,
      )

      // Two calls, not one: `move` generates a fresh sort key from whatever the
      // destination's neighbours are now, so position alone would not restore the old one.
      const moved = await api.moveFeature(current.id, {
        newParent: parentId,
        index: indexAfter(siblings, null),
      })
      await api.updateFeature(moved.id, { sort: entry.before.sort })
      return { ...redo, label: entry.label }
    }

    case 'deleted': {
      const restored = await restoreSubtree(entry.subtree, features)
      const first = restored[0]
      if (!first) return entry
      return { kind: 'restored', label: entry.label, uid: first.uid }
    }

    case 'restored': {
      const current = byUid(features, entry.uid)
      // Snapshot afresh: the subtree may have been edited since it came back. This cannot
      // go through the 'created' case, which refuses to delete anything with children —
      // here the children are the very things being taken away again.
      const captured = subtreeSnapshot(features, current)
      await api.deleteFeature(current.id)
      return deletedEntry(captured, entry.label)
    }
  }
}

/**
 * Writes a subtree back, parents first, so each child has somewhere to land.
 *
 * One create per feature, and any of them can fail. A failure partway would otherwise
 * leave half a subtree on disk while the toast reported that nothing happened, so what has
 * been written is taken away again before the error is passed on. Deleting the root of it
 * is enough: `remove` takes the children directory with it.
 */
async function restoreSubtree(subtree: Snapshot[], features: Feature[]): Promise<Feature[]> {
  const restored: Feature[] = []
  let live = features

  try {
    for (const item of subtree) {
      const parentId = parentIdOf(live, item.parentUid)
      const feature = await api.createFeature({
        parent: parentId,
        title: item.title,
        status: item.status,
        ...(item.importance !== undefined ? { importance: item.importance } : {}),
        tags: item.tags,
        links: item.links,
        code: item.code,
        description: item.description,
        // The uid is why `create` accepts an identity at all: without it, every link to a
        // restored feature would point at nothing.
        uid: item.uid,
        sort: item.sort,
        slug: item.slug,
      })
      restored.push(feature)
      live = [...live, feature]

      if (feature.id !== joinId(parentId, item.slug)) {
        toast(`Restored as ${feature.id}, because something else had taken its place`)
      }
    }
  } catch (error) {
    await rollBack(restored)
    throw error
  }

  return restored
}

/** Best effort: if the tidying up fails too, say what is left rather than hiding it. */
async function rollBack(restored: Feature[]): Promise<void> {
  const first = restored[0]
  if (!first) return
  try {
    await api.deleteFeature(first.id)
  } catch {
    toast.error(`Could not finish restoring, and ${first.id} has been left behind`)
  }
}
