import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import path from 'node:path'
import { Hono } from 'hono'
import {
  backfill,
  create,
  featureFileFor,
  move,
  read,
  remove,
  scanWithProblems,
  StoreError,
  update,
} from '../store/store'
import { isValidStatusId } from '../lib/status'
import { isValidSortKey } from '../lib/tree'
import { loadConfig } from '../store/config'
import { watchFeatures, watchGit } from './watch'
import { featureHistory, uncommittedFeatureIds } from './git'
import { isValidId, isValidUid } from '../lib/ids'
import { normaliseCode } from '../lib/code'
import { normaliseLinks } from '../lib/links'
import { MAX_CODE_COUNT, MAX_LINK_COUNT } from '../lib/types'
import { describeError } from '../lib/errors'

export interface ServerOptions {
  /** Absolute path of the chocks directory holding the feature files. */
  root: string
  /** Repo root, for reading a feature's git history. Defaults to `root`. */
  repoRoot?: string
  /** Name shown in the UI, normally the repo directory. */
  name: string
  host?: string
  /** Version of chocks itself, shown in the footer. */
  version?: string
  /** Where chocks itself lives, for linking a version to its release notes. */
  repository?: string
  /** Directory of built UI assets. Omitted in dev, where Vite serves them instead. */
  uiDir?: string
}

/**
 * Release notes for a version of chocks.
 *
 * Built from the repository recorded in its own `package.json` rather than a constant
 * here, so moving the repo doesn't leave a link pointing at the old one.
 */
function releaseUrlFor(repository: string | undefined, version: string): string {
  if (!repository || version === '') return ''
  const web = repository
    .replace(/^git\+/, '')
    .replace(/^git:/, 'https:')
    .replace(/\.git$/, '')
  return /^https:\/\/github\.com\//.test(web) ? `${web}/releases/tag/v${version}` : ''
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function asLinks(value: unknown) {
  return Array.isArray(value) ? normaliseLinks(value, Number.POSITIVE_INFINITY) : undefined
}

function linksOverLimit(value: unknown): boolean {
  return Array.isArray(value) && value.length > MAX_LINK_COUNT
}

function asCode(value: unknown) {
  return Array.isArray(value) ? normaliseCode(value, Number.POSITIVE_INFINITY) : undefined
}

function codeOverLimit(value: unknown): boolean {
  return Array.isArray(value) && value.length > MAX_CODE_COUNT
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function parseAuthority(
  authority: string,
  protocol: string,
): { hostname: string; origin: string } | null {
  if (authority === '' || /[/?#@]/.test(authority)) return null
  try {
    const url = new URL(`${protocol}//${authority}`)
    return { hostname: normalizeHostname(url.hostname), origin: url.origin }
  } catch {
    return null
  }
}

function isAllowedHostname(hostname: string, configuredHost: string): boolean {
  if (LOOPBACK_HOSTS.has(hostname)) return true
  const configured = normalizeHostname(configuredHost)
  if (WILDCARD_HOSTS.has(configured)) return isIP(hostname) !== 0
  return hostname === configured
}

/**
 * Builds the server and starts watching the chocks directory.
 *
 * Watching belongs to the process, not to a connection: a file arriving with no uid has to
 * be backfilled whether or not anyone has a tab open, or a headless chocks leaves it
 * unlinkable until someone restarts.
 */
export function createApp(options: ServerOptions): { app: Hono; stop: () => Promise<void> } {
  const app = new Hono()
  const { root } = options

  /** Connected SSE clients. Empty is the normal case for a headless run, not an error. */
  const subscribers = new Set<(event: string) => void>()
  const broadcast = (event: string) => {
    for (const send of subscribers) send(event)
  }

  /** Backfills, chained not concurrent: two passes over one file would both mint it a uid. */
  let inFlight: Promise<unknown> = Promise.resolve()

  const stopWatching = watchFeatures(root, () => {
    // Catch before finally, not after: a rejection here has no other handler, so an
    // unwritable file would take the server down rather than cost one backfill. Swallowing
    // it also keeps the chain alive. Clients refetch either way, the files still changed.
    inFlight = inFlight
      .then(() => backfill(root))
      .catch((error: unknown) => {
        console.error('chocks: could not backfill after a change on disk', error)
      })
      .finally(() => broadcast('changed'))
  })
  // A commit does not touch the feature files, so git activity is its own signal.
  const stopWatchingGit = watchGit(options.repoRoot ?? root, () => broadcast('git'))

  app.onError((error, c) => {
    if (error instanceof StoreError) {
      return c.json({ message: error.message }, error.status as 400 | 404 | 409)
    }
    console.error('chocks: request failed', error)
    // Hand the real message back rather than "Internal error". chocks binds to localhost
    // and has no accounts, so there is no one to keep it from, and the difference is
    // between a bug report that names the problem and one that says it broke.
    return c.json({ message: describeError(error) }, 500)
  })

  app.use('*', async (c, next) => {
    const requestUrl = new URL(c.req.url)
    const authority = parseAuthority(c.req.header('Host') ?? requestUrl.host, requestUrl.protocol)
    if (!authority || !isAllowedHostname(authority.hostname, options.host ?? '127.0.0.1')) {
      return c.json({ message: 'Request host is not allowed' }, 403)
    }

    const origin = c.req.header('Origin')
    if (!SAFE_METHODS.has(c.req.method) && origin !== undefined) {
      let sameOrigin = false
      try {
        sameOrigin = new URL(origin).origin === authority.origin
      } catch {
        sameOrigin = false
      }
      if (!sameOrigin) return c.json({ message: 'Cross-origin changes are not allowed' }, 403)
    }

    await next()
  })

  app.use('/api/*', async (c, next) => {
    if (['POST', 'PATCH'].includes(c.req.method)) {
      try {
        const body: unknown = await c.req.json()
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return c.json({ message: 'JSON request body must be an object' }, 400)
        }
      } catch {
        return c.json({ message: 'Malformed JSON request body' }, 400)
      }
    }
    await next()
  })

  // The tree changes under the UI whenever a file changes on disk, which is the whole
  // point. Without a header saying so, a browser is free to decide for itself how long one
  // of these responses stays good, and then live reload quietly stops being live.
  app.use('/api/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  app.get('/api/workspace', async (c) => {
    // Read per request rather than caching: editing config.yaml should take effect on the
    // next refresh, the same as editing a feature file.
    const { config } = await loadConfig(root)
    const version = options.version ?? ''
    return c.json({
      root,
      name: options.name,
      version,
      releaseUrl: releaseUrlFor(options.repository, version),
      config,
    })
  })

  // /api/features is polled on every reload and file change; without this a persistent
  // conflict (e.g. two clashing forms of a feature) would print its warning on every one
  // of those instead of once until the problem actually changes.
  let lastWarnedProblems = new Set<string>()

  app.get('/api/features', async (c) => {
    const { features, problems } = await scanWithProblems(root)
    for (const problem of problems) {
      if (!lastWarnedProblems.has(problem)) console.warn(`chocks: ${problem}`)
    }
    lastWarnedProblems = new Set(problems)
    return c.json(features)
  })

  /** Ids of features with changes not yet committed, for the header badge and tree rows. */
  app.get('/api/uncommitted', async (c) => {
    const ids = await uncommittedFeatureIds(options.repoRoot ?? root, root)
    return c.json({ ids })
  })

  /**
   * A feature's history, straight from git.
   *
   * chocks has no revision model of its own — the repo is the record.
   *
   * Deliberately on its own prefix rather than `/api/features/:id/history`: a feature id
   * contains slashes, so a greedy `:id{.+}` swallows the trailing segment and Hono's
   * router will not backtrack to rescue it.
   */
  app.get('/api/history/:id{.+}', async (c) => {
    const id = c.req.param('id')
    if (!isValidId(id)) return c.json({ message: `Invalid feature id: ${id}` }, 400)
    const file = await featureFileFor(root, id)
    return c.json(await featureHistory(options.repoRoot ?? root, file))
  })

  app.get('/api/features/:id{.+}', async (c) => c.json(await read(root, c.req.param('id'))))

  app.post('/api/features', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    if (linksOverLimit(body.links)) {
      return c.json({ message: `Links exceed maximum count of ${MAX_LINK_COUNT}` }, 400)
    }
    if (codeOverLimit(body.code)) {
      return c.json({ message: `Code exceeds maximum count of ${MAX_CODE_COUNT}` }, 400)
    }
    if (body.sort !== undefined && (typeof body.sort !== 'string' || !isValidSortKey(body.sort))) {
      return c.json({ message: 'Invalid sort key' }, 400)
    }
    const feature = await create(root, {
      parent: typeof body.parent === 'string' ? body.parent : '',
      title: typeof body.title === 'string' ? body.title : '',
      statuses: (await loadConfig(root)).config.statuses,
      status: isValidStatusId(body.status) ? body.status : undefined,
      tags: asStringArray(body.tags),
      links: asLinks(body.links),
      code: asCode(body.code),
      description: typeof body.description === 'string' ? body.description : undefined,
      // Only honoured when they are the real thing, so a restore puts back an identity
      // rather than inventing one. Anything else falls through to a fresh uid and a place
      // at the end, the same as an ordinary create.
      uid: isValidUid(body.uid) ? body.uid : undefined,
      sort: typeof body.sort === 'string' && isValidSortKey(body.sort) ? body.sort : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
    })
    return c.json(feature, 201)
  })

  app.patch('/api/features/:id{.+}', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    if (linksOverLimit(body.links)) {
      return c.json({ message: `Links exceed maximum count of ${MAX_LINK_COUNT}` }, 400)
    }
    if (codeOverLimit(body.code)) {
      return c.json({ message: `Code exceeds maximum count of ${MAX_CODE_COUNT}` }, 400)
    }
    if (body.sort !== undefined && (typeof body.sort !== 'string' || !isValidSortKey(body.sort))) {
      return c.json({ message: 'Invalid sort key' }, 400)
    }
    const feature = await update(root, c.req.param('id'), {
      title: typeof body.title === 'string' ? body.title : undefined,
      status: isValidStatusId(body.status) ? body.status : undefined,
      tags: asStringArray(body.tags),
      links: asLinks(body.links),
      code: asCode(body.code),
      description: typeof body.description === 'string' ? body.description : undefined,
      sort: typeof body.sort === 'string' ? body.sort : undefined,
    })
    return c.json(feature)
  })

  // Distinct from PATCH because a move rewrites ids across the whole subtree, so clients
  // must refetch rather than patch their cache.
  app.post('/api/features/:id{.+}/move', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    const index =
      typeof body.index === 'number' && Number.isInteger(body.index) && body.index >= 0
        ? body.index
        : undefined
    if (index === undefined) {
      return c.json({ message: 'Invalid move index' }, 400)
    }
    const feature = await move(root, c.req.param('id'), {
      newParent: typeof body.newParent === 'string' ? body.newParent : '',
      index,
    })
    return c.json(feature)
  })

  app.delete('/api/features/:id{.+}', async (c) => {
    await remove(root, c.req.param('id'))
    return c.body(null, 204)
  })

  /**
   * Server-sent events carrying nothing but a nudge to refetch.
   *
   * The point is that editing a feature file in your editor updates the open UI — the same
   * loop Storybook gives you for stories.
   */
  app.get('/api/events', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        let open = true
        const send = (event: string) => {
          if (!open) return
          try {
            controller.enqueue(encoder.encode(`data: ${event}\n\n`))
          } catch {
            // The client went away mid-broadcast. Drop it rather than letting one dead
            // connection throw across the others.
            open = false
            subscribers.delete(send)
          }
        }

        send('connected')
        subscribers.add(send)
        // Proxies and load balancers drop idle connections; this keeps it warm.
        const heartbeat = setInterval(() => send('ping'), 30_000)

        c.req.raw.signal.addEventListener('abort', () => {
          open = false
          clearInterval(heartbeat)
          subscribers.delete(send)
          try {
            controller.close()
          } catch {
            // Already closed by the client disconnecting.
          }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  })

  if (options.uiDir && existsSync(options.uiDir)) {
    const uiDir = path.resolve(options.uiDir)

    app.get('*', async (c) => {
      const requested = decodeURIComponent(new URL(c.req.url).pathname)
      const asset = await readAsset(uiDir, requested)
      if (asset) {
        return c.body(asset.body, 200, {
          'Content-Type': asset.type,
          // Vite fingerprints asset filenames, so they are safe to cache hard.
          'Cache-Control': requested.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        })
      }

      // Unknown path: hand back the shell so client-side routes resolve.
      const shell = await readAsset(uiDir, '/index.html')
      if (!shell) return c.text('UI assets are missing from this build', 500)
      return c.body(shell.body, 200, { 'Content-Type': 'text/html; charset=utf-8' })
    })
  }

  return {
    app,
    /**
     * Releases the watchers, waiting for a backfill already queued or writing.
     *
     * `writeAtomic` renames a temp file into place, so exiting between the two leaves a
     * stray `.tmp` in a directory whose whole point is that you commit it.
     */
    stop: async () => {
      stopWatching()
      stopWatchingGit()
      await inFlight
    },
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

/**
 * Reads a built asset.
 *
 * Serving from an absolute directory rather than Hono's serveStatic, because under `npx`
 * the process cwd is the user's repo while the assets live inside the installed package —
 * a cwd-relative root would point at the wrong place entirely.
 */
async function readAsset(
  uiDir: string,
  requestPath: string,
): Promise<{ body: Uint8Array<ArrayBuffer>; type: string } | null> {
  if (requestPath.includes('\0')) return null

  const relative = requestPath.replace(/^\/+/, '')
  const target = path.resolve(uiDir, relative)
  // The request path is attacker-controlled; never read outside the asset directory.
  if (target !== uiDir && !target.startsWith(uiDir + path.sep)) return null

  try {
    const file = await readFile(target)
    // Copy into a plain ArrayBuffer-backed view: a Buffer may sit on a SharedArrayBuffer,
    // which is not assignable to the web Response body type.
    const body = new Uint8Array(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    )
    return {
      body,
      type: MIME_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
    }
  } catch {
    return null
  }
}
