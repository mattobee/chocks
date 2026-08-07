import { afterEach, describe, expect, it } from 'vitest'
import { readStacks, writeStacks } from './undo-storage'
import type { UndoEntry } from './undo'

afterEach(() => sessionStorage.clear())

const entry: UndoEntry = { kind: 'created', label: 'created Auth', uid: 'aaaaaaaaa1' }

describe('the undo stack across a refresh', () => {
  it('starts empty', () => {
    expect(readStacks()).toEqual({ undo: [], redo: [] })
  })

  it('comes back as it went in', () => {
    // The point of entries being data rather than closures: a refresh used to lose them.
    writeStacks({ undo: [entry], redo: [] })
    expect(readStacks()).toEqual({ undo: [entry], redo: [] })
  })

  it('keeps both stacks apart', () => {
    const redone: UndoEntry = { kind: 'restored', label: 'deleted Billing', uid: 'aaaaaaaaa4' }
    writeStacks({ undo: [entry], redo: [redone] })

    const read = readStacks()
    expect(read.undo).toEqual([entry])
    expect(read.redo).toEqual([redone])
  })

  it('survives a subtree snapshot, which is the biggest thing it has to hold', () => {
    const deleted: UndoEntry = {
      kind: 'deleted',
      label: 'deleted Auth',
      subtree: [
        {
          uid: 'aaaaaaaaa1',
          title: 'Auth',
          description: 'Body.',
          status: 'idea',
          tags: ['api'],
          links: [],
          code: [],
          sort: 'a0',
          slug: 'auth',
          parentUid: null,
        },
      ],
    }
    writeStacks({ undo: [deleted], redo: [] })

    expect(readStacks().undo).toEqual([deleted])
  })

  it('ignores anything that is not one of ours', () => {
    // A shape left by an older build would otherwise blow up somewhere less obvious.
    sessionStorage.setItem(
      'chocks:undo',
      JSON.stringify({ undo: [{ label: 'from an older build' }, entry], redo: 'not an array' }),
    )

    expect(readStacks()).toEqual({ undo: [entry], redo: [] })
  })

  it('starts empty rather than throwing on nonsense', () => {
    sessionStorage.setItem('chocks:undo', 'not json at all')
    expect(readStacks()).toEqual({ undo: [], redo: [] })
  })
})
