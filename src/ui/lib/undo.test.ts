import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyEntry,
  createdEntry,
  deletedEntry,
  movedEntry,
  StaleUndoError,
  subtreeSnapshot,
  updatedEntry,
} from './undo'
import { makeFeature } from '@/ui/test-utils'
import type { Feature } from '@/lib/types'

const createFeature = vi.fn()
const updateFeature = vi.fn()
const moveFeature = vi.fn()
const deleteFeature = vi.fn()

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      createFeature: (input: unknown) => createFeature(input),
      updateFeature: (id: string, patch: unknown) => updateFeature(id, patch),
      moveFeature: (id: string, input: unknown) => moveFeature(id, input),
      deleteFeature: (id: string) => deleteFeature(id),
    },
  }
})

afterEach(() => vi.resetAllMocks())

/** auth (a…1) with two children, the shape most of these need. */
function tree(): Feature[] {
  return [
    makeFeature({ id: 'auth', uid: 'aaaaaaaaa1', title: 'Auth', sort: 'a0' }),
    makeFeature({
      id: 'auth/oauth',
      parent: 'auth',
      uid: 'aaaaaaaaa2',
      title: 'OAuth',
      sort: 'a0',
      description: 'Providers.',
    }),
    makeFeature({
      id: 'auth/oauth/github',
      parent: 'auth/oauth',
      uid: 'aaaaaaaaa3',
      title: 'GitHub',
      sort: 'a0',
    }),
    makeFeature({ id: 'billing', uid: 'aaaaaaaaa4', title: 'Billing', sort: 'a1' }),
  ]
}

const find = (features: Feature[], id: string) => features.find((f) => f.id === id)!

describe('undoing a create', () => {
  it('deletes what was created', async () => {
    const features = tree()
    const entry = createdEntry(find(features, 'billing'))

    await applyEntry(entry, features)

    expect(deleteFeature).toHaveBeenCalledWith('billing')
  })

  it('refuses once it has sub-features, rather than deleting someone else’s work', async () => {
    const features = tree()
    const entry = createdEntry(find(features, 'auth'))

    await expect(applyEntry(entry, features)).rejects.toThrow(StaleUndoError)
    expect(deleteFeature).not.toHaveBeenCalled()
  })
})

describe('undoing an edit', () => {
  it('writes the old fields back', async () => {
    const features = tree()
    const before = find(features, 'auth/oauth')
    const entry = updatedEntry(before, features)

    const after = features.map((f) =>
      f.uid === before.uid ? { ...f, title: 'Renamed', id: 'auth/renamed' } : f,
    )
    await applyEntry(entry, after)

    expect(updateFeature).toHaveBeenCalledWith('auth/renamed', {
      title: 'OAuth',
      status: before.status,
      tags: before.tags,
      links: before.links,
      description: 'Providers.',
    })
  })

  it('finds the feature by uid after it has been renamed and moved', async () => {
    const features = tree()
    const entry = updatedEntry(find(features, 'auth/oauth'), features)

    // Same feature, entirely different path.
    const after = [
      features[0]!,
      { ...features[1]!, id: 'billing/identity', parent: 'billing' },
      features[3]!,
    ]
    await applyEntry(entry, after)

    expect(updateFeature.mock.calls[0]?.[0]).toBe('billing/identity')
  })

  it('refuses when the feature is gone', async () => {
    const features = tree()
    const entry = updatedEntry(find(features, 'billing'), features)

    await expect(
      applyEntry(
        entry,
        features.filter((f) => f.id !== 'billing'),
      ),
    ).rejects.toThrow(StaleUndoError)
  })
})

describe('undoing a move', () => {
  it('moves it home and then writes the exact old sort key back', async () => {
    // Position alone cannot restore the key: move generates a fresh one from whatever the
    // destination's neighbours happen to be.
    const features = tree()
    const before = find(features, 'auth/oauth')
    const entry = movedEntry(before, features)

    const after = features.map((f) =>
      f.uid === before.uid ? { ...f, id: 'billing/oauth', parent: 'billing' } : f,
    )
    moveFeature.mockResolvedValue({ ...before, id: 'auth/oauth' })
    await applyEntry(entry, after)

    expect(moveFeature).toHaveBeenCalledWith('billing/oauth', { newParent: 'auth', index: 0 })
    expect(updateFeature).toHaveBeenCalledWith('auth/oauth', { sort: 'a0' })
  })

  it('sends a feature back to the root, not to a parent called ""', async () => {
    const features = tree()
    const before = find(features, 'billing')
    const entry = movedEntry(before, features)

    const after = features.map((f) =>
      f.uid === before.uid ? { ...f, id: 'auth/billing', parent: 'auth' } : f,
    )
    moveFeature.mockResolvedValue({ ...before })
    await applyEntry(entry, after)

    expect(moveFeature.mock.calls[0]?.[1]).toMatchObject({ newParent: '' })
  })
})

describe('undoing a delete', () => {
  it('puts the subtree back parents first, each with its original uid', async () => {
    const features = tree().map((feature) =>
      feature.id === 'auth'
        ? {
            ...feature,
            links: [{ label: 'Auth docs', url: 'https://docs.example.com/auth', type: 'docs' }],
          }
        : feature,
    )
    const captured = subtreeSnapshot(features, find(features, 'auth'))
    const remaining = features.filter((f) => !f.id.startsWith('auth'))

    createFeature.mockImplementation((input: { parent: string; title: string; uid: string }) =>
      Promise.resolve(
        makeFeature({
          id: input.parent
            ? `${input.parent}/${input.title.toLowerCase()}`
            : input.title.toLowerCase(),
          parent: input.parent,
          uid: input.uid,
          title: input.title,
        }),
      ),
    )

    await applyEntry(deletedEntry(captured), remaining)

    const titles = createFeature.mock.calls.map((call) => call[0].title)
    expect(titles).toEqual(['Auth', 'OAuth', 'GitHub'])
    const uids = createFeature.mock.calls.map((call) => call[0].uid)
    expect(uids).toEqual(['aaaaaaaaa1', 'aaaaaaaaa2', 'aaaaaaaaa3'])
    expect(createFeature.mock.calls[0]?.[0].links).toEqual([
      { label: 'Auth docs', url: 'https://docs.example.com/auth', type: 'docs' },
    ])
    // Each child lands under the parent restored a moment earlier.
    expect(createFeature.mock.calls[1]?.[0].parent).toBe('auth')
    expect(createFeature.mock.calls[2]?.[0].parent).toBe('auth/oauth')
  })

  it('can be redone, taking the restored subtree away again', async () => {
    // createdEntry refuses to delete anything with children, so routing redo through it
    // meant redo failed for every subtree that had any.
    const features = tree()
    const captured = subtreeSnapshot(features, find(features, 'auth'))
    createFeature.mockImplementation((input: { uid: string; title: string; parent: string }) =>
      Promise.resolve(makeFeature({ id: 'auth', uid: input.uid, title: input.title })),
    )

    const redo = await applyEntry(deletedEntry(captured), [])
    await applyEntry(redo, features)

    expect(deleteFeature).toHaveBeenCalledWith('auth')
  })

  it('names the action the same way in both directions', async () => {
    const features = tree()
    const created = find(features, 'billing')
    const entry = createdEntry(created)
    expect(entry.label).toBe('created Billing')

    createFeature.mockResolvedValue(created)
    const redo = await applyEntry(entry, features)

    // Not "deleted Billing": redoing re-creates it, so the toast must not say the opposite
    // of what just happened.
    expect(redo.label).toBe('created Billing')
  })

  it('takes back what it wrote when a later create fails', async () => {
    // Otherwise a failure partway leaves half a subtree on disk while the toast says the
    // undo did not happen.
    const features = tree()
    const captured = subtreeSnapshot(features, find(features, 'auth'))
    createFeature
      .mockResolvedValueOnce(makeFeature({ id: 'auth', uid: 'aaaaaaaaa1', title: 'Auth' }))
      .mockRejectedValueOnce(new Error('disk full'))

    await expect(applyEntry(deletedEntry(captured), [])).rejects.toThrow('disk full')

    // One delete of the root is enough: remove takes the children directory with it.
    expect(deleteFeature).toHaveBeenCalledWith('auth')
  })

  it('reports what is left behind when the tidying up fails too', async () => {
    const features = tree()
    const captured = subtreeSnapshot(features, find(features, 'auth'))
    createFeature
      .mockResolvedValueOnce(makeFeature({ id: 'auth', uid: 'aaaaaaaaa1', title: 'Auth' }))
      .mockRejectedValueOnce(new Error('disk full'))
    deleteFeature.mockRejectedValue(new Error('read-only'))

    // The original failure is what propagates; the leftovers are reported, not swallowed.
    await expect(applyEntry(deletedEntry(captured), [])).rejects.toThrow('disk full')
  })

  it('carries the sort key, so the subtree comes back in its old order', async () => {
    const features = tree()
    const captured = subtreeSnapshot(features, find(features, 'billing'))
    createFeature.mockResolvedValue(makeFeature({ id: 'billing', uid: 'aaaaaaaaa4' }))

    await applyEntry(deletedEntry(captured), [])

    expect(createFeature.mock.calls[0]?.[0].sort).toBe('a1')
  })
})

describe('subtreeSnapshot', () => {
  it('collects the feature and everything under it, parents first', () => {
    const features = tree()
    expect(subtreeSnapshot(features, find(features, 'auth')).map((s) => s.title)).toEqual([
      'Auth',
      'OAuth',
      'GitHub',
    ])
  })

  it('records the parent by uid, since ids move', () => {
    const features = tree()
    const [root, child] = subtreeSnapshot(features, find(features, 'auth'))
    expect(root?.parentUid).toBeNull()
    expect(child?.parentUid).toBe('aaaaaaaaa1')
  })
})
