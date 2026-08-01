import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { backfill, create, move, read, remove, scan, StoreError, update } from '../store/store'
import { isValidStatusId } from '../lib/status'
import { loadConfig } from '../store/config'
import { watchFeatures, watchGit } from './watch'
import { featureHistory } from './git'
import { FEATURE_SUFFIX, isValidId } from '../lib/ids'

export interface ServerOptions {
  /** Absolute path of the chocks directory holding the feature files. */
  root: string
  /** Repo root, for reading a feature's git history. Defaults to `root`. */
  repoRoot?: string
  /** Name shown in the UI, normally the repo directory. */
  name: string
  /** Directory of built UI assets. Omitted in dev, where Vite serves them instead. */
  uiDir?: string
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

export function createApp(options: ServerOptions) {
  const app = new Hono()
  const { root } = options

  app.onError((error, c) => {
    if (error instanceof StoreError) {
      return c.json({ message: error.message }, error.status as 400 | 404)
    }
    console.error(error)
    return c.json({ message: 'Internal error' }, 500)
  })

  app.get('/api/workspace', async (c) => {
    // Read per request rather than caching: editing config.yaml should take effect on the
    // next refresh, the same as editing a feature file.
    const { config } = await loadConfig(root)
    return c.json({ root, name: options.name, config })
  })

  app.get('/api/features', async (c) => c.json(await scan(root)))

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
    const file = path.join(root, `${id}${FEATURE_SUFFIX}`)
    return c.json(await featureHistory(options.repoRoot ?? root, file))
  })

  app.get('/api/features/:id{.+}', async (c) => c.json(await read(root, c.req.param('id'))))

  app.post('/api/features', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    const feature = await create(root, {
      parent: typeof body.parent === 'string' ? body.parent : '',
      title: typeof body.title === 'string' ? body.title : '',
      statuses: (await loadConfig(root)).config.statuses,
      status: isValidStatusId(body.status) ? body.status : undefined,
      tags: asStringArray(body.tags),
      description: typeof body.description === 'string' ? body.description : undefined,
    })
    return c.json(feature, 201)
  })

  app.patch('/api/features/:id{.+}', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    const feature = await update(root, c.req.param('id'), {
      title: typeof body.title === 'string' ? body.title : undefined,
      status: isValidStatusId(body.status) ? body.status : undefined,
      tags: asStringArray(body.tags),
      description: typeof body.description === 'string' ? body.description : undefined,
      sort: typeof body.sort === 'string' ? body.sort : undefined,
    })
    return c.json(feature)
  })

  // Distinct from PATCH because a move rewrites ids across the whole subtree, so clients
  // must refetch rather than patch their cache.
  app.post('/api/features/:id{.+}/move', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    const feature = await move(root, c.req.param('id'), {
      newParent: typeof body.newParent === 'string' ? body.newParent : '',
      index: typeof body.index === 'number' ? body.index : 0,
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
        const send = (event: string) => controller.enqueue(encoder.encode(`data: ${event}\n\n`))

        send('connected')
        // Files can appear with no uid or sort key — hand-written, or written by an agent
        // seeding the tree while chocks is already running. Startup only backfills once, so
        // do it here too, before telling the client to refetch, rather than leaving them
        // unlinkable and unsortable until the next restart.
        const stopWatching = watchFeatures(root, () => {
          void backfill(root).finally(() => send('changed'))
        })
        // A commit does not touch the feature files, so git activity is its own signal.
        const stopWatchingGit = watchGit(options.repoRoot ?? root, () => send('git'))
        // Proxies and load balancers drop idle connections; this keeps it warm.
        const heartbeat = setInterval(() => send('ping'), 30_000)

        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(heartbeat)
          stopWatching()
          stopWatchingGit()
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

  return app
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
