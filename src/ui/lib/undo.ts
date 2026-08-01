import { api } from './api'
import { childrenOf, indexAfter } from '@/lib/tree'
import { slugOf } from '@/lib/ids'
import type { Feature } from '@/lib/types'

/**
 * Reversing what the UI just did.
 *
 * chocks keeps no history of its own — the repo does that. This is the smaller thing: a
 * way back from the edit you regret a second later, held in memory for as long as the tab
 * is open and no further.
 *
 * Every entry refers to features by `uid`. Ids are paths, so a rename or a move changes
 * them, and changes them for every descendant too. A uid is the only handle that survives
 * the operations undo has to reverse.
 */
export interface UndoEntry {
  /** Shown in the toast: "Undid: renamed OAuth providers". */
  label: string
  /** Uids this entry expects to still be there, checked before it is applied. */
  touches: string[]
  /** Puts the world back. Runs against the current feature list. */
  undo: (features: Feature[]) => Promise<UndoEntry>
}

/**
 * A feature as it was.
 *
 * The id is left out because it is a path and a path moves. The slug is kept, because a
 * hand-written file's name need not match its title and restoring it under a name derived
 * from the title would rename it behind the user's back.
 */
type Snapshot = Omit<Feature, 'id' | 'parent'> & { parentUid: string | null; slug: string }

export class StaleUndoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaleUndoError'
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

function snapshot(features: Feature[], feature: Feature): Snapshot {
  const parent = features.find((other) => other.id === feature.parent)
  const { id: _id, parent: _parent, ...rest } = feature
  return { ...rest, parentUid: parent?.uid ?? null, slug: slugOf(feature.id) }
}

/**
 * Undoing a create is deleting it again.
 *
 * Deliberately does not put back anything added underneath it since. Deleting takes the
 * subtree with it, and quietly discarding someone's later work is worse than refusing.
 */
export function createdEntry(created: Feature): UndoEntry {
  return {
    label: `created ${created.title}`,
    touches: [created.uid],
    undo: async (features) => {
      const current = byUid(features, created.uid)
      if (childrenOf(features, current.id).length > 0) {
        throw new StaleUndoError('it has sub-features now, so undoing would delete them')
      }
      await api.deleteFeature(current.id)
      return deletedEntry([snapshot(features, current)])
    },
  }
}

/** Undoing an edit is writing the old fields back. The file renames itself if the title moved. */
export function updatedEntry(before: Feature, features: Feature[]): UndoEntry {
  const previous = snapshot(features, before)
  return {
    label: `edited ${before.title}`,
    touches: [before.uid],
    undo: async (currentFeatures) => {
      const current = byUid(currentFeatures, before.uid)
      // Captured before the write, so redoing puts back what is on screen right now.
      const redo = updatedEntry(current, currentFeatures)
      await api.updateFeature(current.id, {
        title: previous.title,
        status: previous.status,
        tags: previous.tags,
        description: previous.description,
      })
      return redo
    },
  }
}

/**
 * Undoing a move is two calls, not one.
 *
 * `move` generates a fresh sort key from whatever the destination's neighbours are at the
 * time, so asking for the old position would not reproduce the old key. Move it home,
 * then write the exact key back.
 */
export function movedEntry(before: Feature, features: Feature[]): UndoEntry {
  const previous = snapshot(features, before)
  return {
    label: `moved ${before.title}`,
    touches: [before.uid],
    undo: async (currentFeatures) => {
      const current = byUid(currentFeatures, before.uid)
      const redo = movedEntry(current, currentFeatures)
      const parentId = parentIdOf(currentFeatures, previous.parentUid)
      const siblings = childrenOf(currentFeatures, parentId).filter(
        (feature) => feature.uid !== before.uid,
      )

      const moved = await api.moveFeature(current.id, {
        newParent: parentId,
        index: indexAfter(siblings, null),
      })
      await api.updateFeature(moved.id, { sort: previous.sort })
      return redo
    },
  }
}

/**
 * Undoing a delete is writing the subtree back from what the browser was holding.
 *
 * Parents first, so each child has somewhere to land. Each feature comes back with its
 * original uid, which is the whole reason `create` accepts one: without it every link to
 * a restored feature would point at nothing.
 */
export function deletedEntry(subtree: Snapshot[]): UndoEntry {
  const root = subtree[0]
  return {
    label: root ? `deleted ${root.title}` : 'deleted a feature',
    // The features are gone, so there is nothing to check for. The parent is checked as
    // the restore walks, and a missing one fails the entry before anything is written.
    touches: [],
    undo: async (features) => {
      const restored: Feature[] = []
      let live = features
      for (const item of subtree) {
        const parentId = parentIdOf([...live, ...restored], item.parentUid)
        const feature = await api.createFeature({
          parent: parentId,
          title: item.title,
          status: item.status,
          tags: item.tags,
          description: item.description,
          uid: item.uid,
          sort: item.sort,
          slug: item.slug,
        })
        restored.push(feature)
        live = [...live, feature]
      }
      const first = restored[0]
      return first ? createdEntry(first) : deletedEntry(subtree)
    },
  }
}

/**
 * A feature and everything under it, ordered parents first.
 *
 * Captured before the delete, because afterwards there is nothing left to read: `remove`
 * takes the whole children directory with it and returns nothing.
 */
export function subtreeSnapshot(features: Feature[], feature: Feature): Snapshot[] {
  const collected: Snapshot[] = []
  const walk = (current: Feature) => {
    collected.push(snapshot(features, current))
    for (const child of childrenOf(features, current.id)) walk(child)
  }
  walk(feature)
  return collected
}
