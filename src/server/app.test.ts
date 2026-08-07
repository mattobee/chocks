import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { MAX_CODE_COUNT, MAX_LINK_COUNT, type Feature, type Workspace } from '../lib/types'

const run = promisify(execFile)

let root: string
let app: ReturnType<typeof createApp>['app']
let stop: () => Promise<void>

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'chocks-api-'))
  ;({ app, stop } = createApp({ root, name: 'test-repo' }))
})

afterEach(async () => {
  // The app watches for as long as it lives, so an unstopped one outlives its directory.
  await stop()
  await rm(root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function createFeature(parent: string, title: string): Promise<Feature> {
  const response = await app.request('/api/features', json({ parent, title }))
  expect(response.status).toBe(201)
  return (await response.json()) as Feature
}

describe('request security', () => {
  it('rejects an unexpected host before it can change a feature', async () => {
    const response = await app.request('/api/features', {
      ...json({ parent: '', title: 'Blocked' }),
      headers: { 'Content-Type': 'application/json', Host: 'attacker.example' },
    })

    expect(response.status).toBe(403)
    expect(await (await app.request('/api/features')).json()).toEqual([])
  })

  it.each(['POST', 'PATCH', 'DELETE'])('rejects a cross-origin %s', async (method) => {
    const response = await app.request('/api/features', {
      method,
      headers: { Host: 'localhost:2457', Origin: 'https://attacker.example' },
    })

    expect(response.status).toBe(403)
  })

  it('allows a same-origin change', async () => {
    const response = await app.request('/api/features', {
      ...json({ parent: '', title: 'Allowed' }),
      headers: {
        'Content-Type': 'application/json',
        Host: 'localhost:2457',
        Origin: 'http://localhost:2457',
      },
    })

    expect(response.status).toBe(201)
  })

  it('allows the configured network host', async () => {
    const networked = createApp({ root, name: 'test-repo', host: 'workstation.local' })
    const response = await networked.app.request('http://workstation.local:2457/api/features', {
      ...json({ parent: '', title: 'Networked' }),
      headers: {
        'Content-Type': 'application/json',
        Host: 'workstation.local:2457',
        Origin: 'http://workstation.local:2457',
      },
    })
    await networked.stop()

    expect(response.status).toBe(201)
  })

  it('allows IP addresses when bound to a wildcard host', async () => {
    const networked = createApp({ root, name: 'test-repo', host: '0.0.0.0' })
    const response = await networked.app.request('http://192.0.2.1:2457/api/workspace')
    await networked.stop()

    expect(response.status).toBe(200)
  })
})

describe('GET /api/workspace', () => {
  it('reports the directory being served', async () => {
    const body = (await (await app.request('/api/workspace')).json()) as {
      root: string
      name: string
      config: { statuses: { id: string }[] }
    }
    expect(body.root).toBe(root)
    expect(body.name).toBe('test-repo')
    // No config.yaml present, so the defaults are served.
    expect(body.config.statuses.map((status) => status.id)).toEqual([
      'planned',
      'pre-release',
      'released',
      'deprecated',
      'dropped',
    ])
  })

  it('reports the version it is running as, and where to read about it', async () => {
    const versioned = createApp({
      root,
      name: 'test-repo',
      version: '1.2.3',
      repository: 'git+https://github.com/mattobee/chocks.git',
    })
    const body = (await (await versioned.app.request('/api/workspace')).json()) as Workspace
    await versioned.stop()

    expect(body.version).toBe('1.2.3')
    expect(body.releaseUrl).toBe('https://github.com/mattobee/chocks/releases/tag/v1.2.3')
  })

  it('offers no release link when it cannot know the version', async () => {
    // Running from somewhere its own package.json isn't readable.
    const body = (await (await app.request('/api/workspace')).json()) as Workspace
    expect(body.version).toBe('')
    expect(body.releaseUrl).toBe('')
  })

  it('offers no release link for a repository it cannot build one for', async () => {
    const elsewhere = createApp({
      root,
      name: 'test-repo',
      version: '1.2.3',
      repository: 'git+https://gitlab.com/someone/chocks.git',
    })
    const body = (await (await elsewhere.app.request('/api/workspace')).json()) as Workspace
    await elsewhere.stop()

    expect(body.version).toBe('1.2.3')
    expect(body.releaseUrl).toBe('')
  })
})

describe('features API', () => {
  it('starts empty', async () => {
    const response = await app.request('/api/features')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })

  it('returns valid features when another feature has conflicting forms', async () => {
    await createFeature('', 'Billing')
    await writeFile(path.join(root, 'auth.chocks.md'), 'title: Leaf', 'utf8')
    await mkdir(path.join(root, 'auth'))
    await writeFile(path.join(root, 'auth', 'index.chocks.md'), 'title: Directory', 'utf8')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await app.request('/api/features')
    const features = (await response.json()) as Feature[]

    expect(response.status).toBe(200)
    expect(features.map((feature) => feature.id)).toEqual(['billing'])
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/remove either auth\.chocks\.md or the auth\/ directory/),
    )
    warning.mockRestore()
  })

  it('warns about a persistent conflict once, not on every poll', async () => {
    await writeFile(path.join(root, 'auth.chocks.md'), 'title: Leaf', 'utf8')
    await mkdir(path.join(root, 'auth'))
    await writeFile(path.join(root, 'auth', 'index.chocks.md'), 'title: Directory', 'utf8')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await app.request('/api/features')
    await app.request('/api/features')
    await app.request('/api/features')

    expect(warning).toHaveBeenCalledTimes(1)
    warning.mockRestore()
  })

  it('creates, reads back and nests', async () => {
    const parent = await createFeature('', 'Authentication')
    const child = await createFeature(parent.id, 'OAuth')

    expect(parent.id).toBe('authentication')
    expect(child.id).toBe('authentication/oauth')
    expect(child.parent).toBe('authentication')

    const all = (await (await app.request('/api/features')).json()) as Feature[]
    expect(all.map((feature) => feature.id).sort()).toEqual([
      'authentication',
      'authentication/oauth',
    ])
  })

  it('keeps concurrent creates as separate features', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.request('/api/features', json({ parent: '', title: 'Authentication' })),
      ),
    )

    expect(responses.every((response) => response.status === 201)).toBe(true)
    expect(await (await app.request('/api/features')).json()).toHaveLength(20)
  })

  it('reads a single nested feature by its path id', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    const response = await app.request('/api/features/auth/oauth')
    expect(response.status).toBe(200)
    expect(((await response.json()) as Feature).title).toBe('OAuth')
  })

  it('updates fields', async () => {
    const feature = await createFeature('', 'Auth')
    const links = [{ label: 'Auth docs', url: 'https://docs.example.com/auth', type: 'docs' }]
    const code = [{ path: 'src/auth' }, { path: 'src/auth/*.test.ts', kind: 'test' }]
    const response = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'released',
        description: 'Shipped.',
        tags: ['api'],
        links,
        code,
      }),
    })
    const updated = (await response.json()) as Feature
    expect(updated).toMatchObject({
      status: 'released',
      description: 'Shipped.',
      tags: ['api'],
      links,
      code,
    })
  })

  it('rejects API writes over the link limit', async () => {
    const links = Array.from({ length: MAX_LINK_COUNT + 1 }, (_, index) => ({
      url: `https://example.com/${index}`,
    }))
    const createResponse = await app.request(
      '/api/features',
      json({ parent: '', title: 'Auth', links }),
    )
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({
      message: `Links exceed maximum count of ${MAX_LINK_COUNT}`,
    })

    const feature = await createFeature('', 'Auth')
    const updateResponse = await app.request(`/api/features/${feature.id}`, {
      ...json({ links }),
      method: 'PATCH',
    })
    expect(updateResponse.status).toBe(400)
  })

  it('rejects API writes over the code limit', async () => {
    const code = Array.from({ length: MAX_CODE_COUNT + 1 }, (_, index) => ({
      path: `src/file-${index}.ts`,
    }))
    const createResponse = await app.request(
      '/api/features',
      json({ parent: '', title: 'Auth', code }),
    )
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({
      message: `Code exceeds maximum count of ${MAX_CODE_COUNT}`,
    })

    const feature = await createFeature('', 'Auth')
    const updateResponse = await app.request(`/api/features/${feature.id}`, {
      ...json({ code }),
      method: 'PATCH',
    })
    expect(updateResponse.status).toBe(400)
  })

  it('moves a feature and rewrites descendant ids', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    await createFeature('auth/oauth', 'GitHub')
    await createFeature('', 'Billing')

    const response = await app.request(
      '/api/features/auth/oauth/move',
      json({ newParent: 'billing', index: 0 }),
    )
    expect(response.status).toBe(200)

    const all = (await (await app.request('/api/features')).json()) as Feature[]
    expect(all.map((feature) => feature.id).sort()).toEqual([
      'auth',
      'billing',
      'billing/oauth',
      'billing/oauth/github',
    ])
  })

  it('deletes a feature and its subtree', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')

    const response = await app.request('/api/features/auth', { method: 'DELETE' })
    expect(response.status).toBe(204)
    expect(await (await app.request('/api/features')).json()).toEqual([])
  })

  it('404s an unknown feature', async () => {
    expect((await app.request('/api/features/ghost')).status).toBe(404)
  })

  it('400s an empty title', async () => {
    expect((await app.request('/api/features', json({ parent: '', title: '' }))).status).toBe(400)
  })

  it('409s an edit to malformed frontmatter with an actionable message', async () => {
    const content = [
      '---',
      'title: Conflicted',
      '<' + '<<<<<< HEAD',
      'owner: platform',
      '=' + '======',
      'owner: payments',
      '>' + '>>>>>> branch',
      '---',
      '',
    ].join('\n')
    await writeFile(path.join(root, 'conflicted.chocks.md'), content, 'utf8')

    const response = await app.request('/api/features/conflicted', {
      ...json({ title: 'Resolved' }),
      method: 'PATCH',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message: 'Feature conflicted has malformed frontmatter; fix the file by hand',
    })
  })

  it('400s malformed and non-object JSON', async () => {
    for (const body of ['{', 'null', '[]']) {
      const response = await app.request('/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      expect(response.status).toBe(400)
    }
  })

  it('400s missing parents on create and move', async () => {
    const createResponse = await app.request(
      '/api/features',
      json({ parent: 'missing', title: 'Child' }),
    )
    expect(createResponse.status).toBe(400)

    await createFeature('', 'Auth')
    const moveResponse = await app.request(
      '/api/features/auth/move',
      json({ newParent: 'missing', index: 0 }),
    )
    expect(moveResponse.status).toBe(400)
  })

  it('400s invalid sort keys', async () => {
    const createResponse = await app.request(
      '/api/features',
      json({ parent: '', title: 'Auth', sort: '9bad' }),
    )
    expect(createResponse.status).toBe(400)

    const feature = await createFeature('', 'Auth')
    const updateResponse = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort: '9bad' }),
    })
    expect(updateResponse.status).toBe(400)
  })

  it.each([-1, 1.5, null, '0'])('400s invalid move index %j', async (index) => {
    await createFeature('', 'Auth')
    const response = await app.request('/api/features/auth/move', json({ newParent: '', index }))
    expect(response.status).toBe(400)
  })

  it('400s a move into the feature itself', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    const response = await app.request(
      '/api/features/auth/move',
      json({ newParent: 'auth/oauth', index: 0 }),
    )
    expect(response.status).toBe(400)
  })

  it('accepts a status the config does not define, rather than correcting it', async () => {
    // A branch may use a different config; the value must survive a round trip.
    const feature = await createFeature('', 'Auth')
    const response = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'shipped' }),
    })
    expect(((await response.json()) as Feature).status).toBe('shipped')
  })

  it('ignores a status that is not slug-shaped', async () => {
    const feature = await createFeature('', 'Auth')
    const response = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Not A Slug' }),
    })
    expect(((await response.json()) as Feature).status).toBe('planned')
  })
})

describe('error responses', () => {
  it('names the problem rather than saying "Internal error"', async () => {
    // What made the sort-key bug slow to find: the UI said "Internal error" while the
    // sentence naming the problem only ever reached the server's terminal.
    const failing = createApp({ root, name: 'test-repo' })
    failing.app.get('/api/boom', () => {
      throw new Error('the disk caught fire')
    })

    const response = await failing.app.request('/api/boom')
    await failing.stop()
    expect(response.status).toBe(500)
    expect(((await response.json()) as { message: string }).message).toBe('the disk caught fire')
  })

  it('still maps a store error to its own status and message', async () => {
    const response = await app.request('/api/features/ghost')
    expect(response.status).toBe(404)
    expect(((await response.json()) as { message: string }).message).toContain('No such feature')
  })
})

describe('path traversal', () => {
  // The id becomes a filesystem path, so these are the requests that matter.
  it('refuses a traversing read', async () => {
    const response = await app.request('/api/features/..%2F..%2Fetc%2Fpasswd')
    expect(response.status).toBe(400)
  })

  it('refuses a traversing delete', async () => {
    const response = await app.request('/api/features/..%2F..%2Fsecrets', { method: 'DELETE' })
    expect(response.status).toBe(400)
  })

  it('refuses a traversing create parent', async () => {
    const response = await app.request('/api/features', json({ parent: '../escape', title: 'X' }))
    expect(response.status).toBe(400)
  })

  it('refuses a traversing move destination', async () => {
    await createFeature('', 'Auth')
    const response = await app.request(
      '/api/features/auth/move',
      json({ newParent: '../../tmp', index: 0 }),
    )
    expect(response.status).toBe(400)
  })
})

describe('history route', () => {
  // Feature ids contain slashes, so history lives on its own prefix — nesting it under
  // /api/features/:id/history is silently swallowed by the greedy id param.
  it('is not shadowed by the feature read route', async () => {
    await createFeature('', 'Auth')
    const response = await app.request('/api/history/auth')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { commits: unknown[]; uncommitted: boolean }
    expect(Array.isArray(body.commits)).toBe(true)
  })

  it('resolves history for a nested feature', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    const response = await app.request('/api/history/auth/oauth')
    expect(response.status).toBe(200)
    expect(Array.isArray(((await response.json()) as { commits: unknown[] }).commits)).toBe(true)
  })

  it('refuses a traversing id', async () => {
    const response = await app.request('/api/history/..%2F..%2Fetc%2Fpasswd')
    expect(response.status).toBe(400)
  })
})

describe('code route', () => {
  it('is not shadowed by the feature read route', async () => {
    await createFeature('', 'Auth')
    const response = await app.request('/api/code/auth')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { matches: unknown[] }
    expect(Array.isArray(body.matches)).toBe(true)
  })

  it('resolves matches for a nested feature', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    const response = await app.request('/api/code/auth/oauth')
    expect(response.status).toBe(200)
    expect(Array.isArray(((await response.json()) as { matches: unknown[] }).matches)).toBe(true)
  })

  it('refuses a traversing id', async () => {
    const response = await app.request('/api/code/..%2F..%2Fetc%2Fpasswd')
    expect(response.status).toBe(400)
  })

  it('counts a literal path against the repo root, not the chocks directory', async () => {
    // No repoRoot passed to createApp in this suite, so it defaults to root: writing the
    // file straight into root is what makes it "repo-relative" here.
    await writeFile(path.join(root, 'auth.ts'), '', 'utf8')
    const feature = await createFeature('', 'Auth')
    await app.request(`/api/features/${feature.id}`, {
      ...json({ code: [{ path: 'auth.ts' }, { path: 'missing.ts' }] }),
      method: 'PATCH',
    })

    const response = await app.request('/api/code/auth')
    const body = (await response.json()) as { matches: { path: string; count: number | null }[] }
    expect(body.matches).toEqual([
      { path: 'auth.ts', count: 1 },
      { path: 'missing.ts', count: 0 },
    ])
  })

  it('skips a flag entry rather than reporting it as zero', async () => {
    const feature = await createFeature('', 'Auth')
    await app.request(`/api/features/${feature.id}`, {
      ...json({ code: [{ path: 'new-onboarding', kind: 'flag' }] }),
      method: 'PATCH',
    })

    const response = await app.request('/api/code/auth')
    const body = (await response.json()) as { matches: { count: number | null }[] }
    expect(body.matches).toEqual([{ path: 'new-onboarding', count: null }])
  })
})

describe('GET /api/uncommitted', () => {
  async function git(...args: string[]): Promise<void> {
    await run('git', ['-C', root, ...args])
  }

  it('is empty with no repo at all', async () => {
    const response = await app.request('/api/uncommitted')
    expect(await response.json()).toEqual({ ids: [] })
  })

  it('lists a feature that is written but not committed', async () => {
    await git('init', '-q', '-b', 'main')
    const feature = await createFeature('', 'Auth')

    const response = await app.request('/api/uncommitted')
    expect(await response.json()).toEqual({ ids: [feature.id] })
  })

  it('is empty again once committed', async () => {
    await git('init', '-q', '-b', 'main')
    await createFeature('', 'Auth')
    await git('add', '-A')
    await git(
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=Tester',
      'commit',
      '-m',
      'feat: add auth',
    )

    const response = await app.request('/api/uncommitted')
    expect(await response.json()).toEqual({ ids: [] })
  })
})

describe('watching for changes', () => {
  it('backfills a uid for a file written with no client connected', async () => {
    // Give chokidar a moment to finish its initial scan before touching anything, as in
    // watch.test.ts.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // What an agent seeding the tree writes: no uid, and no tab open to notice.
    await writeFile(
      path.join(root, 'headless.chocks.md'),
      '---\ntitle: Headless\nstatus: planned\n---\n\nWritten with no uid.\n',
      'utf8',
    )

    await vi.waitFor(
      async () => {
        const features = (await (await app.request('/api/features')).json()) as Feature[]
        expect(features[0]?.uid).toMatch(/^[a-f][0-9a-f]{9}$/)
      },
      { timeout: 5_000 },
    )
  })
})

describe('SSE /api/events', () => {
  it('backfills a uid for a file written while connected, before telling clients to refetch', async () => {
    const response = await app.request('/api/events')
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    async function nextEvent(): Promise<string> {
      let buffer = ''
      while (!buffer.includes('\n\n')) {
        const { value, done } = await reader.read()
        if (done) throw new Error('stream closed')
        buffer += decoder.decode(value, { stream: true })
      }
      return buffer
    }

    await expect(nextEvent()).resolves.toContain('connected')
    // Give chokidar a moment to finish its initial scan before touching anything, as in
    // watch.test.ts.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Written straight to disk, bypassing the store, the way an agent seeding the tree
    // would — no uid, the way a hand-written file arrives.
    await writeFile(
      path.join(root, 'seeded.chocks.md'),
      '---\ntitle: Seeded\nstatus: planned\n---\n\nWritten with no uid.\n',
      'utf8',
    )

    await expect(nextEvent()).resolves.toContain('changed')

    const features = (await (await app.request('/api/features')).json()) as Feature[]
    expect(features[0]?.uid).toMatch(/^[a-f][0-9a-f]{9}$/)

    await reader.cancel()
  })
})
