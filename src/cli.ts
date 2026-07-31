#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { serve } from '@hono/node-server'
import { createApp } from './server/app'
import { FEATURE_SUFFIX } from './lib/ids'
import { ensureUids, scanWithIgnored } from './store/store'

const HELP = `
chocks — track planned and existing features as a tree, in your repo

Usage
  npx chocks [options]

Options
  -d, --dir <path>    Feature directory (default: .chocks next to the repo root)
  -p, --port <port>   Port to listen on (default: 4321)
      --host <host>   Address to bind (default: 127.0.0.1)
                      Use 0.0.0.0 to reach it from other machines. There is no
                      authentication, so only do this on a trusted network.
      --no-open       Do not open a browser
  -h, --help          Show this message
`

/** Walks up from `start` looking for a repo root, falling back to `start`. */
function findRepoRoot(start: string): string {
  let current = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return path.resolve(start)
    current = parent
  }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

/** True when the bind address reaches beyond this machine. */
function isExposed(host: string): boolean {
  return !LOOPBACK.has(host)
}

/** Usable URLs for a bind address — wildcards expand to the real interface addresses. */
function urlsFor(host: string, port: number): { local: string; network: string[] } {
  const local = `http://${LOOPBACK.has(host) ? 'localhost' : host}:${port}`
  if (host !== '0.0.0.0' && host !== '::') return { local, network: [] }

  const network: string[] = []
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node <18.4 reported family as a string; newer versions use the number 4.
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown as number) === 4
      if (isIPv4 && !address.internal) network.push(`http://${address.address}:${port}`)
    }
  }
  return { local: `http://localhost:${port}`, network }
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
      .on('error', () => {})
      .unref()
  } catch {
    // Headless or locked-down environment — the URL is printed anyway.
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', short: 'd' },
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      // parseArgs has no `--no-x` negation, so the off switch is its own option.
      open: { type: 'boolean', default: true },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const root = path.resolve(values.dir ?? path.join(repoRoot, '.chocks'))
  const port = Number(values.port ?? process.env.PORT ?? 4321)
  const host = values.host ?? '127.0.0.1'

  if (Number.isNaN(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${values.port}`)
    process.exitCode = 1
    return
  }

  const created = !existsSync(root)
  if (created) await mkdir(root, { recursive: true })

  // Hand-written files, and anything predating uids, get a permanent one now. Done at
  // startup rather than during a read so that GETs stay free of side effects.
  const backfilled = await ensureUids(root)

  // A file named `auth.md` instead of `auth.feature.md` would otherwise just not appear,
  // with nothing to explain why.
  const { ignored } = await scanWithIgnored(root)

  // In the published package the UI sits next to the compiled server.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const uiDir = path.join(here, 'ui')

  const app = createApp({ root, repoRoot, name: path.basename(repoRoot), uiDir })

  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const { local, network } = urlsFor(host, info.port)

    console.log(`\n  chocks    ${local}`)
    for (const url of network) console.log(`  network   ${url}`)
    console.log(
      `  features  ${path.relative(process.cwd(), root) || root}${created ? '  (created)' : ''}`,
    )
    if (backfilled > 0) {
      console.log(`  backfilled a stable id into ${backfilled} feature file(s)`)
    }
    if (ignored.length > 0) {
      const names = ignored.map((file) => path.relative(root, file))
      console.log(
        `\n  Skipped ${ignored.length} markdown file(s) without the ${FEATURE_SUFFIX} suffix:` +
          `\n    ${names.slice(0, 5).join('\n    ')}` +
          (names.length > 5 ? `\n    …and ${names.length - 5} more` : ''),
      )
    }

    if (isExposed(host)) {
      // chocks has no authentication, and its API creates, edits and deletes files in the
      // repo. On a shared network that is a write-capable endpoint for anyone who can
      // reach this port, so say so plainly rather than burying it in the docs.
      console.log(
        '\n  Warning: reachable from the network with no authentication.' +
          '\n  Anyone who can reach this port can read and modify files in ' +
          `${path.relative(process.cwd(), root) || root}.` +
          '\n  Use a trusted network, or drop --host to bind to localhost only.',
      )
    }
    console.log('')

    if (values.open && !values['no-open']) openBrowser(local)
  })

  const shutdown = () => {
    server.close(() => process.exit(0))
    // Don't hang on a held-open SSE connection.
    setTimeout(() => process.exit(0), 500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
