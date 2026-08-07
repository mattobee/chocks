import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backfill,
  create,
  featureFileFor,
  move,
  read,
  remove,
  runStoreMutation,
  scan,
  scanWithIgnored,
  scanWithProblems,
  StoreError,
  update,
} from './store'
import { buildTree, findByKey, isValidSortKey } from '../lib/tree'
import { featureKey } from '../lib/ids'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LINK_COUNT,
  MAX_TAG_COUNT,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  type Feature,
} from '../lib/types'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    link: vi.fn(actual.link),
    readFile: vi.fn(actual.readFile),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  }
})

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'chocks-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Writes a feature file directly, bypassing the store, to set up fixtures. */
async function given(relativePath: string, frontmatter: string, body = ''): Promise<void> {
  const parts = relativePath.split('/')
  for (let depth = 1; depth < parts.length; depth++) {
    const parent = path.join(root, ...parts.slice(0, depth))
    const leaf = `${parent}.chocks.md`
    if (existsSync(leaf)) {
      await mkdir(parent)
      await rename(leaf, path.join(parent, 'index.chocks.md'))
    }
  }
  const file = path.join(root, relativePath)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8')
}

const idOf = (feature: Feature) => feature.id
const bySort = (a: Feature, b: Feature) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)

/** Renders the scanned tree as indented ids, so assertions read like the structure. */
function shape(features: Awaited<ReturnType<typeof scan>>): string[] {
  const render = (nodes: ReturnType<typeof buildTree>, depth = 0): string[] =>
    nodes.flatMap((node) => [
      `${'  '.repeat(depth)}${node.feature.id}`,
      ...render(node.children, depth + 1),
    ])
  return render(buildTree(features))
}

describe('scan', () => {
  it('returns nothing for a missing directory', async () => {
    expect(await scan(path.join(root, 'absent'))).toEqual([])
  })

  it('derives id, parent and title from the path', async () => {
    await given('auth.chocks.md', 'title: Authentication\nstatus: released\nsort: a0')
    const [feature] = await scan(root)
    expect(feature).toMatchObject({
      id: 'auth',
      parent: '',
      title: 'Authentication',
      status: 'released',
    })
  })

  it('treats a sibling directory as the children of a feature', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    await given('auth/oauth.chocks.md', 'title: OAuth\nsort: a0')
    await given('auth/oauth/github.chocks.md', 'title: GitHub\nsort: a0')
    expect(shape(await scan(root))).toEqual(['auth', '  auth/oauth', '    auth/oauth/github'])
  })

  it('orders siblings by sort key', async () => {
    await given('b.chocks.md', 'title: B\nsort: a1')
    await given('a.chocks.md', 'title: A\nsort: a0')
    expect(shape(await scan(root))).toEqual(['a', 'b'])
  })

  it('falls back to a slug-derived title when frontmatter has none', async () => {
    await given('password-reset.chocks.md', 'status: planned\nsort: a0')
    const [feature] = await scan(root)
    expect(feature?.title).toBe('Password reset')
  })

  it('reads links through to the feature', async () => {
    await given(
      'auth.chocks.md',
      'title: Auth\nstatus: planned\nlinks:\n  - label: Auth docs\n    url: https://docs.example.com/auth\n    type: docs\n  - url: docs/auth.md\nsort: a0',
    )
    const [feature] = await scan(root)
    expect(feature?.links).toEqual([
      { label: 'Auth docs', url: 'https://docs.example.com/auth', type: 'docs' },
      { url: 'docs/auth.md' },
    ])
  })

  it('ignores dotfiles and non-markdown files', async () => {
    await given('real.chocks.md', 'title: Real\nsort: a0')
    await writeFile(path.join(root, 'README.txt'), 'not a feature', 'utf8')
    // A plain .md is someone's notes, not a feature — the suffix is what distinguishes them.
    await writeFile(path.join(root, 'README.md'), '# Notes', 'utf8')
    await writeFile(path.join(root, '.DS_Store'), '', 'utf8')
    await mkdir(path.join(root, '.git'), { recursive: true })
    await writeFile(path.join(root, '.git', 'config.md'), 'hidden', 'utf8')
    expect((await scan(root)).map((f) => f.id)).toEqual(['real'])
  })

  it('ignores a directory without an index file when it has only dotfiles', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    await mkdir(path.join(root, 'empty'))
    await writeFile(path.join(root, 'empty', '.DS_Store'), '', 'utf8')

    expect((await scan(root)).map((f) => f.id)).toEqual(['auth'])
  })

  it('ignores a truly empty directory without an index file', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    await mkdir(path.join(root, 'empty'))

    expect((await scan(root)).map((f) => f.id)).toEqual(['auth'])
  })

  it('rejects a directory without an index file but with content', async () => {
    await mkdir(path.join(root, 'orphan'))
    await writeFile(path.join(root, 'orphan', 'notes.md'), 'notes', 'utf8')

    await expect(scan(root)).rejects.toThrow(
      /orphan.*add index\.chocks\.md or remove the directory/,
    )
  })

  it('rejects an index file at the store root', async () => {
    await given('index.chocks.md', 'title: Invalid\nsort: a0')

    await expect(scan(root)).rejects.toThrow(/root index\.chocks\.md/)
  })

  it('rejects duplicate leaf and directory forms', async () => {
    await given('auth.chocks.md', 'title: Leaf\nsort: a0')
    await mkdir(path.join(root, 'auth'))
    await writeFile(
      path.join(root, 'auth', 'index.chocks.md'),
      '---\ntitle: Directory\nsort: a0\n---\n',
      'utf8',
    )

    await expect(scan(root)).rejects.toThrow(
      /remove either auth\.chocks\.md or the auth\/ directory/,
    )
  })

  it('can skip a duplicate feature and continue scanning', async () => {
    await given('billing.chocks.md', 'title: Billing\nsort: a0')
    await given('auth.chocks.md', 'title: Leaf\nsort: a0')
    await mkdir(path.join(root, 'auth'))
    await writeFile(
      path.join(root, 'auth', 'index.chocks.md'),
      '---\ntitle: Directory\nsort: a0\n---\n',
      'utf8',
    )
    await writeFile(path.join(root, 'auth', 'oauth.chocks.md'), 'title: OAuth', 'utf8')

    const result = await scanWithProblems(root)

    expect(result.features.map((feature) => feature.id)).toEqual(['billing'])
    expect(result.problems).toEqual([
      expect.stringMatching(/remove either auth\.chocks\.md or the auth\/ directory/),
    ])
  })

  it('gives sort-less files a stable alphabetical order', async () => {
    await given('zebra.chocks.md', 'title: Z')
    await given('apple.chocks.md', 'title: A')
    expect(shape(await scan(root))).toEqual(['apple', 'zebra'])
  })

  it('skips features that disappear between readdir and readFile during scan', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    vi.mocked(readFile).mockRejectedValueOnce(
      Object.assign(new Error('Feature disappeared'), { code: 'ENOENT' }),
    )

    expect(await scan(root)).toEqual([])
  })
})

describe('symbolic links', () => {
  it('refuses to scan a linked store root', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'chocks-linked-root-'))
    const outside = path.join(parent, 'outside')
    const linkedRoot = path.join(parent, '.chocks')
    try {
      await mkdir(outside)
      await symlink(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')

      await expect(scan(linkedRoot)).rejects.toMatchObject({ name: 'StoreError', status: 400 })
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('refuses a linked store root', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'chocks-linked-root-'))
    const outside = path.join(parent, 'outside')
    const linkedRoot = path.join(parent, '.chocks')
    try {
      await mkdir(outside)
      await symlink(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')

      await expect(create(linkedRoot, { parent: '', title: 'Escaped' })).rejects.toThrow(
        /Symbolic links/,
      )
      expect(existsSync(path.join(outside, 'escaped.chocks.md'))).toBe(false)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('refuses to read through a linked directory', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    try {
      await writeFile(
        path.join(outside, 'secret.chocks.md'),
        '---\ntitle: Secret\nstatus: idea\nsort: a0\n---\n',
        'utf8',
      )
      await symlink(
        outside,
        path.join(root, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )

      await expect(read(root, 'linked/secret')).rejects.toThrow(/Symbolic links/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses to create through a linked directory', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    try {
      await symlink(
        outside,
        path.join(root, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )

      await expect(create(root, { parent: 'linked', title: 'Escaped' })).rejects.toThrow(
        /Symbolic links/,
      )
      expect(existsSync(path.join(outside, 'escaped.chocks.md'))).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses to remove through a linked directory', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    const outsideFile = path.join(outside, 'secret.chocks.md')
    try {
      await writeFile(outsideFile, 'secret', 'utf8')
      await symlink(
        outside,
        path.join(root, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )

      await expect(remove(root, 'linked/secret')).rejects.toMatchObject({ status: 400 })
      expect(existsSync(outsideFile)).toBe(true)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses to promote a linked parent rather than failing on mkdir', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    try {
      await given('auth.chocks.md', 'title: Auth\nuid: aaa0000001\nsort: a0')
      await symlink(outside, path.join(root, 'auth'), 'dir')

      await expect(create(root, { parent: 'auth', title: 'OAuth' })).rejects.toThrow(
        /Symbolic links/,
      )
      expect(existsSync(path.join(outside, 'oauth.chocks.md'))).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses to resolve a linked leaf file, so callers cannot follow it', async () => {
    // The history route uses the path from featureFileFor directly, with no read to
    // re-check it.
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    try {
      const target = path.join(outside, 'secret.chocks.md')
      await writeFile(target, '---\ntitle: Secret\nsort: a0\n---\n', 'utf8')
      await symlink(target, path.join(root, 'leak.chocks.md'))

      await expect(featureFileFor(root, 'leak')).rejects.toThrow(/Symbolic links/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('skips a linked feature file rather than reading through it', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-outside-'))
    try {
      const target = path.join(outside, 'secret.chocks.md')
      await writeFile(target, '---\ntitle: Secret\nsort: a0\n---\n', 'utf8')
      await symlink(target, path.join(root, 'leak.chocks.md'))
      await given('real.chocks.md', 'title: Real\nsort: a0')

      expect((await scan(root)).map((feature) => feature.id)).toEqual(['real'])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('mutation queue', () => {
  it('runs mutations for one root in call order', async () => {
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = runStoreMutation(root, async () => {
      events.push('first started')
      await gate
      events.push('first finished')
    })
    await vi.waitFor(() => expect(events).toEqual(['first started']))

    const second = runStoreMutation(root, async () => {
      events.push('second')
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual(['first started'])

    release()
    await Promise.all([first, second])
    expect(events).toEqual(['first started', 'first finished', 'second'])
  })

  it('does not block a different root', async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), 'chocks-other-'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    const blocked = runStoreMutation(root, async () => {
      started = true
      await gate
    })
    await vi.waitFor(() => expect(started).toBe(true))

    try {
      await expect(runStoreMutation(otherRoot, async () => 'done')).resolves.toBe('done')
    } finally {
      release()
      await blocked
      await rm(otherRoot, { recursive: true, force: true })
    }
  })

  it('keeps every concurrent create', async () => {
    const created = await Promise.all(
      Array.from({ length: 20 }, () => create(root, { parent: '', title: 'Auth' })),
    )

    expect(new Set(created.map((feature) => feature.id)).size).toBe(20)
    expect(await scan(root)).toHaveLength(20)
  })

  it('merges concurrent updates in call order', async () => {
    await create(root, { parent: '', title: 'Auth' })

    await Promise.all([
      update(root, 'auth', { status: 'released' }),
      update(root, 'auth', { description: 'Changed.' }),
    ])

    expect(await read(root, 'auth')).toMatchObject({
      status: 'released',
      description: 'Changed.',
    })
  })

  it('sees an external edit made while queued', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    const blocked = runStoreMutation(root, async () => {
      started = true
      await gate
    })
    await vi.waitFor(() => expect(started).toBe(true))

    const creating = create(root, { parent: '', title: 'Auth' })
    await given('auth.chocks.md', 'title: External\nstatus: idea\nsort: a0', 'Keep me.')
    release()
    await blocked

    const created = await creating
    expect(created.id).toBe('auth-2')
    expect((await read(root, 'auth')).description).toBe('Keep me.')
  })

  it('orders move before a following remove', async () => {
    await create(root, { parent: '', title: 'Auth' })
    await create(root, { parent: '', title: 'Billing' })

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    const blocked = runStoreMutation(root, async () => {
      started = true
      await gate
    })
    await vi.waitFor(() => expect(started).toBe(true))

    const moving = move(root, 'auth', { newParent: 'billing', index: 0 })
    const removing = remove(root, 'billing/auth')
    release()
    await Promise.all([blocked, moving, removing])

    expect((await scan(root)).map((feature) => feature.id)).toEqual(['billing'])
  })
})

describe('create', () => {
  it('writes a file named from the title', async () => {
    const feature = await create(root, { parent: '', title: 'OAuth Providers' })
    expect(feature.id).toBe('oauth-providers')
    expect(existsSync(path.join(root, 'oauth-providers.chocks.md'))).toBe(true)
  })

  it('nests under a parent', async () => {
    await create(root, { parent: '', title: 'Auth' })
    const child = await create(root, { parent: 'auth', title: 'OAuth' })
    expect(child.id).toBe('auth/oauth')
    expect(existsSync(path.join(root, 'auth', 'oauth.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'auth', 'index.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'auth.chocks.md'))).toBe(false)
  })

  it('promotes a leaf on first child without changing content, uid, or mtime', async () => {
    const parent = await create(root, {
      parent: '',
      title: 'Auth',
      description: 'Keep this body.',
      tags: ['api'],
    })
    const leaf = path.join(root, 'auth.chocks.md')
    const timestamp = new Date('2020-01-02T03:04:05.000Z')
    await utimes(leaf, timestamp, timestamp)
    const before = await readFile(leaf, 'utf8')

    await create(root, { parent: 'auth', title: 'OAuth' })

    const index = path.join(root, 'auth', 'index.chocks.md')
    expect(await readFile(index, 'utf8')).toBe(before)
    expect((await stat(index)).mtime.getTime()).toBe(timestamp.getTime())
    expect((await read(root, 'auth')).uid).toBe(parent.uid)
  })

  it('does not delete files added while a failed promotion is cleaned up', async () => {
    await create(root, { parent: '', title: 'Auth' })
    const error = Object.assign(new Error('Rename failed'), { code: 'EACCES' })
    vi.mocked(rename).mockImplementationOnce(async () => {
      await writeFile(path.join(root, 'auth', 'concurrent.txt'), 'keep', 'utf8')
      throw error
    })

    const failure = await create(root, { parent: 'auth', title: 'OAuth' }).catch(
      (caught: unknown) => caught,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors[0]).toBe(error)
    expect(await readFile(path.join(root, 'auth', 'concurrent.txt'), 'utf8')).toBe('keep')
  })

  it('appends after existing siblings', async () => {
    const first = await create(root, { parent: '', title: 'First' })
    const second = await create(root, { parent: '', title: 'Second' })
    expect(first.sort < second.sort).toBe(true)
  })

  it('disambiguates a colliding slug rather than overwriting', async () => {
    const first = await create(root, { parent: '', title: 'Auth' })
    const second = await create(root, { parent: '', title: 'Auth' })
    expect(first.id).toBe('auth')
    expect(second.id).toBe('auth-2')
    expect((await scan(root)).length).toBe(2)
  })

  it('disambiguates the reserved index slug', async () => {
    const topLevel = await create(root, { parent: '', title: 'Index' })
    const parent = await create(root, { parent: '', title: 'Parent' })
    const nested = await create(root, { parent: parent.id, title: 'Index' })

    expect(topLevel.id).toBe('index-2')
    expect(nested.id).toBe('parent/index-2')
    expect(
      (await scan(root).then((features) => features.map((feature) => feature.id))).sort(),
    ).toEqual(['index-2', 'parent', 'parent/index-2'])
  })

  it('rejects an empty title', async () => {
    await expect(create(root, { parent: '', title: '   ' })).rejects.toThrow(StoreError)
  })

  it('rejects a non-existent parent id', async () => {
    await expect(create(root, { parent: 'non-existent', title: 'X' })).rejects.toThrow(StoreError)
  })

  it('restores a given uid and sort key rather than minting new ones', async () => {
    // What undoing a delete needs: links resolve on uid, so a restored feature has to
    // come back as the same feature, in the same place.
    const restored = await create(root, {
      parent: '',
      title: 'Auth',
      uid: 'a1b2c3d4e5',
      sort: 'a5',
    })

    expect(restored.uid).toBe('a1b2c3d4e5')
    expect(restored.sort).toBe('a5')
    const onDisk = (await scan(root))[0]!
    expect(onDisk.uid).toBe('a1b2c3d4e5')
    expect(onDisk.sort).toBe('a5')
  })

  it('refuses a uid another feature already answers to', async () => {
    await create(root, { parent: '', title: 'First', uid: 'a1b2c3d4e5' })

    await expect(create(root, { parent: '', title: 'Second', uid: 'a1b2c3d4e5' })).rejects.toThrow(
      /already has the uid/,
    )
    expect((await scan(root)).length).toBe(1)
  })

  it('still mints its own identity when none is given', async () => {
    const first = await create(root, { parent: '', title: 'One' })
    const second = await create(root, { parent: '', title: 'Two' })

    expect(first.uid).toMatch(/^[a-f][0-9a-f]{9}$/)
    expect(second.uid).not.toBe(first.uid)
    expect(first.sort < second.sort).toBe(true)
  })

  it('rejects an excessively long title', async () => {
    await expect(
      create(root, { parent: '', title: 'a'.repeat(MAX_TITLE_LENGTH + 1) }),
    ).rejects.toThrow(StoreError)
  })

  it('rejects an excessively long tag', async () => {
    await expect(
      create(root, { parent: '', title: 'Valid', tags: ['a'.repeat(MAX_TAG_LENGTH + 1)] }),
    ).rejects.toThrow(StoreError)
  })

  it('rejects too many tags', async () => {
    await expect(
      create(root, {
        parent: '',
        title: 'Valid',
        tags: Array.from({ length: MAX_TAG_COUNT + 1 }, (_, index) => String(index)),
      }),
    ).rejects.toThrow(StoreError)
  })

  it('rejects too many links', async () => {
    await expect(
      create(root, {
        parent: '',
        title: 'Valid',
        links: Array.from({ length: MAX_LINK_COUNT + 1 }, (_, index) => ({
          url: `https://example.com/${index}`,
        })),
      }),
    ).rejects.toThrow(StoreError)
  })

  it('rejects an excessively long description', async () => {
    await expect(
      create(root, {
        parent: '',
        title: 'Valid',
        description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1),
      }),
    ).rejects.toThrow(StoreError)
  })
})

describe('update', () => {
  it('renames the file when the title changes, so the path never drifts', async () => {
    const created = await create(root, { parent: '', title: 'Auth' })
    const updated = await update(root, created.id, { status: 'released', title: 'Authentication' })

    expect(updated.id).toBe('authentication')
    expect(updated.title).toBe('Authentication')
    expect(updated.status).toBe('released')
    expect(existsSync(path.join(root, 'authentication.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'auth.chocks.md'))).toBe(false)
  })

  it('keeps the uid across a rename, so links survive', async () => {
    const created = await create(root, { parent: '', title: 'Auth' })
    const updated = await update(root, created.id, { title: 'Authentication' })
    expect(updated.uid).toBe(created.uid)
    expect(updated.uid).toMatch(/^[a-f][0-9a-f]{9}$/)
  })

  it('renames a parent directory and keeps uid links stable', async () => {
    const parent = await create(root, { parent: '', title: 'Auth' })
    await create(root, { parent: 'auth', title: 'OAuth' })
    const key = featureKey(parent)

    await update(root, 'auth', { title: 'Identity' })

    const features = await scan(root)
    expect(features.map((f) => f.id).sort()).toEqual(['identity', 'identity/oauth'])
    expect(findByKey(features, key)?.id).toBe('identity')
    expect(existsSync(path.join(root, 'identity', 'index.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'auth'))).toBe(false)
  })

  it('does not move the file when the title changes but the slug does not', async () => {
    const created = await create(root, { parent: '', title: 'Auth' })
    const updated = await update(root, created.id, { title: '  Auth  ' })
    expect(updated.id).toBe('auth')
  })

  it('disambiguates when a rename would collide with a sibling', async () => {
    await create(root, { parent: '', title: 'Billing' })
    const other = await create(root, { parent: '', title: 'Auth' })
    const updated = await update(root, other.id, { title: 'Billing' })
    expect(updated.id).toBe('billing-2')
    expect((await scan(root)).length).toBe(2)
  })

  it('persists the markdown body', async () => {
    const created = await create(root, { parent: '', title: 'Auth' })
    await update(root, created.id, { description: 'Some **notes**.' })
    expect(await readFile(path.join(root, 'auth.chocks.md'), 'utf8')).toContain('Some **notes**.')
  })

  it('ignores a blank title instead of writing one', async () => {
    const created = await create(root, { parent: '', title: 'Auth' })
    expect((await update(root, created.id, { title: '  ' })).title).toBe('Auth')
  })

  it('rejects an unknown feature', async () => {
    await expect(update(root, 'nope', { status: 'released' })).rejects.toThrow(StoreError)
  })

  it('rejects a traversing id', async () => {
    await expect(update(root, '../../etc/passwd', { status: 'released' })).rejects.toThrow(
      StoreError,
    )
  })
})

describe('remove', () => {
  it('deletes the feature and its whole subtree', async () => {
    await create(root, { parent: '', title: 'Auth' })
    await create(root, { parent: 'auth', title: 'OAuth' })
    await create(root, { parent: 'auth/oauth', title: 'GitHub' })

    await remove(root, 'auth')

    expect(await scan(root)).toEqual([])
    expect(existsSync(path.join(root, 'auth.chocks.md'))).toBe(false)
    expect(existsSync(path.join(root, 'auth'))).toBe(false)
  })

  it('leaves siblings alone', async () => {
    await create(root, { parent: '', title: 'Keep' })
    await create(root, { parent: '', title: 'Drop' })
    await remove(root, 'drop')
    expect((await scan(root)).map((f) => f.id)).toEqual(['keep'])
  })

  it('is silent about an already-absent feature', async () => {
    await expect(remove(root, 'ghost')).resolves.toBeUndefined()
  })
})

describe('move', () => {
  beforeEach(async () => {
    await create(root, { parent: '', title: 'Auth' })
    await create(root, { parent: 'auth', title: 'OAuth' })
    await create(root, { parent: 'auth/oauth', title: 'GitHub' })
    await create(root, { parent: '', title: 'Billing' })
  })

  it('reparents a feature and brings its subtree with it', async () => {
    await move(root, 'auth/oauth', { newParent: 'billing', index: 0 })
    expect(shape(await scan(root))).toEqual([
      'auth',
      'billing',
      '  billing/oauth',
      '    billing/oauth/github',
    ])
  })

  it('moves a feature to the top level', async () => {
    await move(root, 'auth/oauth', { newParent: '', index: 0 })
    const ids = (await scan(root)).map((f) => f.id).sort()
    expect(ids).toEqual(['auth', 'billing', 'oauth', 'oauth/github'])
  })

  it('reorders within the same parent without moving files', async () => {
    const before = await scan(root)
    const auth = before.find((f) => f.id === 'auth')!
    await move(root, 'auth', { newParent: '', index: 2 })
    const after = await scan(root)
    const moved = after.find((f) => f.id === 'auth')!
    expect(moved.sort > auth.sort).toBe(true)
    expect(shape(after)[0]).toBe('billing')
  })

  it('refuses to move a feature inside itself', async () => {
    await expect(move(root, 'auth', { newParent: 'auth/oauth', index: 0 })).rejects.toThrow(
      /inside itself/,
    )
  })

  it('refuses to move a feature to a non-existent parent', async () => {
    await expect(move(root, 'auth', { newParent: 'non-existent', index: 0 })).rejects.toThrow(
      StoreError,
    )
  })

  it('refuses to move a feature onto itself', async () => {
    await expect(move(root, 'auth', { newParent: 'auth', index: 0 })).rejects.toThrow(
      /inside itself/,
    )
  })

  it('disambiguates when the destination already has that slug', async () => {
    await create(root, { parent: 'billing', title: 'OAuth' })
    const moved = await move(root, 'auth/oauth', { newParent: 'billing', index: 1 })
    expect(moved.id).toBe('billing/oauth-2')
    expect((await scan(root)).filter((f) => f.parent === 'billing').length).toBe(2)
  })

  it('rejects a traversing destination', async () => {
    await expect(move(root, 'auth', { newParent: '../../tmp', index: 0 })).rejects.toThrow(
      StoreError,
    )
  })

  it('preserves content across a move', async () => {
    await update(root, 'auth/oauth', { description: 'Keep me', status: 'released', tags: ['api'] })
    await move(root, 'auth/oauth', { newParent: '', index: 0 })
    const moved = await read(root, 'oauth')
    expect(moved.description).toBe('Keep me')
    expect(moved.status).toBe('released')
    expect(moved.tags).toEqual(['api'])
  })

  it('does not overwrite a raced destination when moving a leaf', async () => {
    const error = Object.assign(new Error('Destination exists'), { code: 'EEXIST' })
    vi.mocked(link).mockRejectedValueOnce(error)

    await expect(
      move(root, 'auth/oauth/github', { newParent: 'billing', index: 0 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(existsSync(path.join(root, 'auth', 'oauth', 'github.chocks.md'))).toBe(true)
  })

  it('reports a raced parent destination as a conflict, not a crash', async () => {
    // rename onto a directory that gained an index since assertAbsent reports ENOTEMPTY.
    await create(root, { parent: 'billing', title: 'Invoices' })
    vi.mocked(rename).mockRejectedValueOnce(
      Object.assign(new Error('Directory not empty'), { code: 'ENOTEMPTY' }),
    )

    await expect(
      move(root, 'auth/oauth', { newParent: 'billing', index: 0 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(existsSync(path.join(root, 'auth', 'oauth', 'index.chocks.md'))).toBe(true)
  })

  it('leaves a parent source untouched when its directory rename fails', async () => {
    await create(root, { parent: 'billing', title: 'Invoices' })
    const error = Object.assign(new Error('Rename failed'), { code: 'EACCES' })
    vi.mocked(rename).mockRejectedValueOnce(error)

    await expect(move(root, 'auth/oauth', { newParent: 'billing', index: 0 })).rejects.toBe(error)
    expect(existsSync(path.join(root, 'auth', 'oauth', 'index.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'billing', 'oauth'))).toBe(false)
  })
})

describe('round trip', () => {
  it('survives create, edit, move and re-read', async () => {
    await create(root, { parent: '', title: 'Tree' })
    const child = await create(root, {
      parent: 'tree',
      title: 'Drag to reorder',
      status: 'in-progress',
      tags: ['ux'],
      description: 'Uses fractional indexing.',
    })
    await move(root, child.id, { newParent: '', index: 0 })

    const reread = await read(root, 'drag-to-reorder')
    expect(reread).toMatchObject({
      id: 'drag-to-reorder',
      parent: '',
      title: 'Drag to reorder',
      status: 'in-progress',
      tags: ['ux'],
      description: 'Uses fractional indexing.',
    })
  })
})

describe('backfill', () => {
  it('gives hand-written files a permanent uid', async () => {
    await given('legacy.chocks.md', 'title: Legacy\nstatus: released\nsort: a0')
    expect((await scan(root))[0]?.uid).toBe('')

    expect((await backfill(root)).uids).toBe(1)
    const uid = (await scan(root))[0]?.uid
    expect(uid).toMatch(/^[a-f][0-9a-f]{9}$/)

    // Idempotent, and the uid must not change on a second run.
    expect((await backfill(root)).uids).toBe(0)
    expect((await scan(root))[0]?.uid).toBe(uid)
  })

  it('writes the uid unquoted, so it stays a string', async () => {
    await given('legacy.chocks.md', 'title: Legacy\nsort: a0')
    await backfill(root)
    const text = await readFile(path.join(root, 'legacy.chocks.md'), 'utf8')
    expect(text).toMatch(/\nuid: [a-f][0-9a-f]{9}\n/)
    expect(text).not.toContain('uid: "')
  })

  it('leaves the rest of the file alone', async () => {
    await given(
      'legacy.chocks.md',
      'title: Legacy\nstatus: released\ntags: [api]\nsort: a3',
      'Body text.',
    )
    await backfill(root)
    const feature = (await scan(root))[0]!
    expect(feature).toMatchObject({
      title: 'Legacy',
      status: 'released',
      tags: ['api'],
      sort: 'a3',
      description: 'Body text.',
    })
  })

  it('gives files with no sort key a real one', async () => {
    // An agent seeding the tree writes title, status and description, not a sort key.
    await given('audits.chocks.md', 'title: Audits')
    await given('billing.chocks.md', 'title: Billing')
    expect((await scan(root)).map((feature) => feature.sort)).toEqual(['~audits', '~billing'])

    expect((await backfill(root)).sortKeys).toBe(2)

    const sorts = (await scan(root)).map((feature) => feature.sort)
    expect(sorts.every(isValidSortKey)).toBe(true)
    // The order they already displayed in is the order they keep.
    expect(sorts[0]! < sorts[1]!).toBe(true)
  })

  it('keeps the sort keys that are already usable', async () => {
    await given('one.chocks.md', 'title: One\nsort: a0')
    await given('two.chocks.md', 'title: Two')

    expect((await backfill(root)).sortKeys).toBe(1)

    const byId = new Map((await scan(root)).map((feature) => [feature.id, feature.sort]))
    expect(byId.get('one')).toBe('a0')
    expect(byId.get('two')! > 'a0').toBe(true)
  })

  it('keeps the displayed order when an unusable key sorts before a usable one', async () => {
    // `~<slug>` is not the only key that can fail. A hand-edited one can sort anywhere,
    // so appending the unusable ones would quietly move this feature down the list.
    await given('first.chocks.md', 'title: First\nsort: "9bad"')
    await given('second.chocks.md', 'title: Second\nsort: a0')
    expect((await scan(root)).sort(bySort).map(idOf)).toEqual(['first', 'second'])

    await backfill(root)

    const after = (await scan(root)).sort(bySort)
    expect(after.map(idOf)).toEqual(['first', 'second'])
    expect(after.every((feature) => isValidSortKey(feature.sort))).toBe(true)
  })

  it('fills a run of unusable keys in the middle of a group', async () => {
    // `a10` and `a20` sort between the two good keys but are not valid keys themselves.
    await given('a.chocks.md', 'title: A\nsort: a0')
    await given('b.chocks.md', 'title: B\nsort: a10')
    await given('c.chocks.md', 'title: C\nsort: a20')
    await given('d.chocks.md', 'title: D\nsort: a5')
    const before = (await scan(root)).sort(bySort).map(idOf)
    expect(before).toEqual(['a', 'b', 'c', 'd'])

    await backfill(root)

    const after = (await scan(root)).sort(bySort)
    expect(after.map(idOf)).toEqual(before)
    expect(after.every((feature) => isValidSortKey(feature.sort))).toBe(true)
    // The usable keys were left alone, so those files stay out of the diff.
    const byId = new Map(after.map((feature) => [feature.id, feature.sort]))
    expect(byId.get('a')).toBe('a0')
    expect(byId.get('d')).toBe('a5')
  })

  it('reports an unwritable file and carries on with the rest', async () => {
    // Backfilling is a convenience. One read-only file must not cost the other hundred,
    // and must not stop chocks starting.
    await given('locked.chocks.md', 'title: Locked\nuid: aaa0000001\nsort: a0')
    await given('locked/stuck.chocks.md', 'title: Stuck')
    await given('fine.chocks.md', 'title: Fine')
    await chmod(path.join(root, 'locked'), 0o500)

    try {
      const result = await backfill(root)

      expect(result.failures).toHaveLength(1)
      expect(result.failures[0]).toContain('locked/stuck')
      expect(result.sortKeys).toBe(1)

      const fine = (await scan(root)).find((feature) => feature.id === 'fine')!
      expect(isValidSortKey(fine.sort)).toBe(true)
      expect(fine.uid).not.toBe('')
    } finally {
      await chmod(path.join(root, 'locked'), 0o700)
    }
  })

  it('backfills each sibling group independently', async () => {
    await given('parent.chocks.md', 'title: Parent\nsort: a0')
    await given('parent/child.chocks.md', 'title: Child')

    await backfill(root)

    const child = (await scan(root)).find((feature) => feature.id === 'parent/child')!
    expect(isValidSortKey(child.sort)).toBe(true)
  })
})

describe('reordering a tree that was seeded without sort keys', () => {
  // The bug this covers: `scan` stands in `~<slug>` for a missing sort key, which is not a
  // fractional index, so generating a key next to it threw and every drag returned a 500.
  it('moves a feature after the keys have been backfilled', async () => {
    await given('audits.chocks.md', 'title: Audits')
    await given('billing.chocks.md', 'title: Billing')
    await backfill(root)

    const moved = await move(root, 'billing', { newParent: '', index: 0 })

    expect(isValidSortKey(moved.sort)).toBe(true)
    expect((await scan(root)).sort((a, b) => (a.sort < b.sort ? -1 : 1))[0]?.id).toBe('billing')
  })

  it('moves a feature even without a backfill first', async () => {
    // A file can land while chocks is running, so the move path must not depend on it.
    await given('audits.chocks.md', 'title: Audits')
    await given('billing.chocks.md', 'title: Billing')

    const moved = await move(root, 'billing', { newParent: '', index: 0 })

    expect(isValidSortKey(moved.sort)).toBe(true)
  })
})

describe('feature suffix', () => {
  it('ignores markdown without the suffix, so a README is not a phantom feature', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    await writeFile(path.join(root, 'README.md'), '# How this directory works', 'utf8')
    await mkdir(path.join(root, 'auth'))
    await rename(path.join(root, 'auth.chocks.md'), path.join(root, 'auth', 'index.chocks.md'))
    await writeFile(path.join(root, 'auth', 'notes.md'), 'scratch', 'utf8')

    expect((await scan(root)).map((f) => f.id)).toEqual(['auth'])
  })

  it('reports skipped markdown so a mis-named file is not silently invisible', async () => {
    await given('auth.chocks.md', 'title: Auth\nsort: a0')
    await writeFile(path.join(root, 'oauth.md'), '---\ntitle: OAuth\n---\n', 'utf8')

    const { features, ignored } = await scanWithIgnored(root)
    expect(features.map((f) => f.id)).toEqual(['auth'])
    expect(ignored).toHaveLength(1)
    expect(ignored[0]).toContain('oauth.md')
  })

  it('writes new features with the suffix', async () => {
    const feature = await create(root, { parent: '', title: 'OAuth' })
    expect(feature.id).toBe('oauth')
    expect(existsSync(path.join(root, 'oauth.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'oauth.md'))).toBe(false)
  })

  it('keeps the suffix out of the id when nesting', async () => {
    await create(root, { parent: '', title: 'Auth' })
    const child = await create(root, { parent: 'auth', title: 'OAuth' })
    expect(child.id).toBe('auth/oauth')
    expect(existsSync(path.join(root, 'auth', 'oauth.chocks.md'))).toBe(true)
  })
})
