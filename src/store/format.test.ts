import { describe, expect, it } from 'vitest'
import { parseFeatureFile, serializeFeatureFile } from './format'

describe('parseFeatureFile', () => {
  it('reads frontmatter and body', () => {
    const parsed = parseFeatureFile(
      `---\ntitle: OAuth\nstatus: in-progress\ntags:\n  - api\n  - auth\nsort: a1\n---\n\nSupports GitHub and Google.\n`,
      'fallback',
    )
    expect(parsed).toEqual({
      uid: '',
      title: 'OAuth',
      status: 'in-progress',
      tags: ['api', 'auth'],
      sort: 'a1',
      description: 'Supports GitHub and Google.',
    })
  })

  it('falls back to the given title when frontmatter has none', () => {
    expect(parseFeatureFile('---\nstatus: done\n---\n', 'github').title).toBe('github')
  })

  it('treats a file with no frontmatter as all body', () => {
    const parsed = parseFeatureFile('Just some notes.\n', 'notes')
    expect(parsed.title).toBe('notes')
    expect(parsed.description).toBe('Just some notes.')
    expect(parsed.status).toBe('planned')
  })

  it('survives malformed YAML rather than breaking the tree', () => {
    // A half-resolved merge conflict should still open in the UI.
    const parsed = parseFeatureFile('---\ntitle: [unclosed\n---\n\nBody survives.\n', 'fallback')
    expect(parsed.title).toBe('fallback')
    expect(parsed.status).toBe('planned')
    expect(parsed.description).toBe('Body survives.')
  })

  it('rejects an unknown status instead of trusting it', () => {
    expect(parseFeatureFile('---\nstatus: shipped\n---\n', 'x').status).toBe('planned')
  })

  it('accepts a single tag written as a bare string', () => {
    expect(parseFeatureFile('---\ntags: api\n---\n', 'x').tags).toEqual(['api'])
  })

  it('drops blank and duplicate tags', () => {
    expect(parseFeatureFile('---\ntags: [api, "", api, " ux "]\n---\n', 'x').tags).toEqual([
      'api',
      'ux',
    ])
  })

  it('ignores non-string tags', () => {
    expect(parseFeatureFile('---\ntags: [api, 3, null]\n---\n', 'x').tags).toEqual(['api'])
  })

  it('handles CRLF line endings', () => {
    const parsed = parseFeatureFile('---\r\ntitle: Win\r\nstatus: done\r\n---\r\n\r\nBody\r\n', 'x')
    expect(parsed.title).toBe('Win')
    expect(parsed.status).toBe('done')
  })

  it('returns an empty sort when absent, so the caller can assign one', () => {
    expect(parseFeatureFile('---\ntitle: X\n---\n', 'x').sort).toBe('')
  })
})

describe('serializeFeatureFile', () => {
  it('round-trips through the parser', () => {
    const original = {
      title: 'OAuth providers',
      status: 'in-progress' as const,
      uid: 'a1b2c3d4e5',
      tags: ['api'],
      sort: 'a1',
      description: 'Some **markdown**.',
    }
    expect(parseFeatureFile(serializeFeatureFile(original), 'fallback')).toEqual(original)
  })

  it('omits empty tags to keep diffs clean', () => {
    const output = serializeFeatureFile({
      title: 'X',
      status: 'planned',
      uid: '',
      tags: [],
      sort: 'a0',
      description: '',
    })
    expect(output).not.toContain('tags')
  })

  it('writes a body-less feature without trailing blank lines', () => {
    expect(
      serializeFeatureFile({
        title: 'X',
        status: 'planned',
        uid: '',
        tags: [],
        sort: 'a0',
        description: '',
      }),
    ).toBe('---\ntitle: X\nstatus: planned\nsort: a0\n---\n')
  })

  it('keeps key order stable so edits produce minimal diffs', () => {
    const output = serializeFeatureFile({
      title: 'X',
      status: 'done',
      uid: '',
      tags: ['b', 'a'],
      sort: 'a0',
      description: 'x',
    })
    expect(output.indexOf('title')).toBeLessThan(output.indexOf('status'))
    expect(output.indexOf('status')).toBeLessThan(output.indexOf('tags'))
    expect(output.indexOf('tags')).toBeLessThan(output.indexOf('sort'))
    // Tag order is the author's, not sorted for them.
    expect(output.indexOf('- b')).toBeLessThan(output.indexOf('- a'))
  })

  it('preserves markdown containing a horizontal rule', () => {
    // A `---` inside the body must not be mistaken for frontmatter on the way back in.
    const original = {
      title: 'X',
      status: 'planned' as const,
      uid: 'a1b2c3d4e5',
      tags: [],
      sort: 'a0',
      description: 'Before\n\n---\n\nAfter',
    }
    expect(parseFeatureFile(serializeFeatureFile(original), 'x').description).toBe(
      original.description,
    )
  })
})

describe('uid round trip', () => {
  it('preserves a uid through serialize and parse', () => {
    const output = serializeFeatureFile({
      title: 'X',
      status: 'planned',
      uid: 'a1b2c3d4e5',
      tags: [],
      sort: 'a0',
      description: '',
    })
    expect(output).toContain('uid: a1b2c3d4e5')
    expect(parseFeatureFile(output, 'x').uid).toBe('a1b2c3d4e5')
  })

  it('omits the uid entirely when there is not one yet', () => {
    const output = serializeFeatureFile({
      title: 'X',
      status: 'planned',
      uid: '',
      tags: [],
      sort: 'a0',
      description: '',
    })
    expect(output).not.toContain('uid')
  })

  it('treats a malformed uid as absent rather than trusting it', () => {
    // A hyphen would break the URL key split, so it must not survive parsing.
    expect(parseFeatureFile('---\ntitle: X\nuid: bad-uid\n---\n', 'x').uid).toBe('')
    expect(parseFeatureFile('---\ntitle: X\nuid: 12\n---\n', 'x').uid).toBe('')
  })
})
