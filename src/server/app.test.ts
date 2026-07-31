import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import type { Feature } from '../lib/types'

let root: string
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'chocks-api-'))
  app = createApp({ root, name: 'test-repo' })
})

afterEach(async () => {
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
    const body = (await (await app.request('/api/workspace')).json()) as Record<string, string>
    expect(body).toEqual({ root, name: 'test-repo' })
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
      body: JSON.stringify({ status: 'done', description: 'Shipped.', tags: ['api'] }),
    })
    const updated = (await response.json()) as Feature
    expect(updated).toMatchObject({ status: 'done', description: 'Shipped.', tags: ['api'] })
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

  it('ignores an unknown status rather than writing it', async () => {
    const feature = await createFeature('', 'Auth')
    const response = await app.request(`/api/features/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'shipped' }),
    })
    expect(((await response.json()) as Feature).status).toBe('planned')
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
