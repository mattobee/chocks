import { describe, expect, it } from 'vitest'
import { effectiveImportance } from './importance'
import type { Feature, Importance } from './types'

function feature(id: string, importance?: Importance): Feature {
  return {
    id,
    uid: `${id}0000000000`.slice(0, 10),
    parent: '',
    title: id,
    description: '',
    status: 'released',
    ...(importance !== undefined ? { importance } : {}),
    tags: [],
    links: [],
    code: [],
    sort: 'a0',
  }
}

describe('effectiveImportance', () => {
  it('inherits through several undeclared levels', () => {
    const root = feature('root', 'high')
    const parent = feature('parent')
    const child = feature('child')

    expect(effectiveImportance(child, [root, parent])).toEqual({ value: 'high', source: root })
  })

  it('uses the nearest ancestor declaration', () => {
    const root = feature('root', 'high')
    const parent = feature('parent', 'low')

    expect(effectiveImportance(feature('child'), [root, parent])).toEqual({
      value: 'low',
      source: parent,
    })
  })

  it('uses an explicit value over an inherited one', () => {
    const child = feature('child', 'low')
    expect(effectiveImportance(child, [feature('root', 'high')])).toEqual({
      value: 'low',
      source: child,
    })
  })

  it('lets explicit normal stop inheritance', () => {
    const child = feature('child', 'normal')
    expect(effectiveImportance(child, [feature('root', 'high')])).toEqual({
      value: 'normal',
      source: child,
    })
  })

  it('defaults an undeclared root to normal', () => {
    expect(effectiveImportance(feature('root'), [])).toEqual({ value: 'normal', source: null })
  })
})
