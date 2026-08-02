import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import type { Feature, Workspace } from '../lib/types'

let root: string
let app: ReturnType<typeof createApp>['app']
let stop: () => void

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'chocks-api-'))
  ;({ app, stop } = createApp({ root, name: 'test-repo' }))
})

afterEach(async () => {
  // The app watches the directory for its whole life now, so a test that leaves one running
  // holds a watcher on a directory the next line deletes.
  stop()
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
      'idea',
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
    versioned.stop()

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
    elsewhere.stop()

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

  it('reads a single nested feature by its path id', async () => {
    await createFeature('', 'Auth')
    await createFeature('auth', 'OAuth')
    const response = await app.request('/api/features/auth/oauth')
    expect(response.status).toBe(200)
    expect(((await response.json()) as Feature).title).toBe('OAuth')
  })

  it('updates fields', async () => {
    const feature = await createFeature('', 'Auth')
    const response = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'released', description: 'Shipped.', tags: ['api'] }),
    })
    const updated = (await response.json()) as Feature
    expect(updated).toMatchObject({ status: 'released', description: 'Shipped.', tags: ['api'] })
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
    expect(((await response.json()) as Feature).status).toBe('idea')
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
    failing.stop()
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

describe('watching for changes', () => {
  it('backfills a uid for a file written with no client connected', async () => {
    // Give chokidar a moment to finish its initial scan before touching anything, as in
    // watch.test.ts.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // What an agent seeding the tree writes while chocks runs headless. Nobody has a tab
    // open, which used to mean nothing was watching and the uid waited for a restart.
    await writeFile(
      path.join(root, 'headless.chocks.md'),
      '---\ntitle: Headless\nstatus: idea\n---\n\nWritten with no uid.\n',
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
      '---\ntitle: Seeded\nstatus: idea\n---\n\nWritten with no uid.\n',
      'utf8',
    )

    await expect(nextEvent()).resolves.toContain('changed')

    const features = (await (await app.request('/api/features')).json()) as Feature[]
    expect(features[0]?.uid).toMatch(/^[a-f][0-9a-f]{9}$/)

    await reader.cancel()
  })
})
