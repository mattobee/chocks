#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { serve } from '@hono/node-server'
import { createApp } from './server/app'
import { formatContext } from './lib/context'
import { FEATURE_SUFFIX } from './lib/ids'
import { backfill, scanWithIgnored } from './store/store'
import { migrateLayout } from './store/migrate'
import { CONFIG_FILENAME, loadConfig } from './store/config'

const HELP = `
chocks — track planned and existing features as a tree, in your repo

Usage
  npx chocks [options]
  npx chocks context [options]

Commands
  context             Print the feature tree as JSON Lines

Options
  -d, --dir <path>    Feature directory (default: .chocks next to the repo root)
  -p, --port <port>   Port to listen on (default: 2457)
      --host <host>   Address to bind (default: 127.0.0.1)
                      Use 0.0.0.0 to reach it from other machines. There is no
                      authentication, so only do this on a trusted network.
      --no-open       Do not open a browser
  -h, --help          Show this message
`

/**
 * chocks' own package.json, for reporting the version it is running as.
 *
 * Read at runtime rather than inlined at build time so `pnpm dev:server`, which runs the
 * TypeScript directly with no bundler, reports a version too. Both entry points sit one
 * directory below it: `src/cli.ts` in the repo, `dist/cli.mjs` in the published package.
 */
function ownPackage(): { version?: string; repository?: string } {
  try {
    const file = new URL('../package.json', import.meta.url)
    const data = JSON.parse(readFileSync(file, 'utf8')) as {
      version?: string
      repository?: { url?: string }
    }
    return { version: data.version, repository: data.repository?.url }
  } catch {
    // Running from somewhere unexpected. A missing version is worth less than a crash.
    return {}
  }
}

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

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      dir: { type: 'string', short: 'd' },
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      // parseArgs has no `--no-x` negation, so the off switch is its own option.
      open: { type: 'boolean', default: true },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const command = positionals[0]
  if (positionals.length > 1 || (command && command !== 'context')) {
    console.error(`Unknown command: ${positionals.join(' ')}`)
    process.exitCode = 1
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const root = path.resolve(values.dir ?? path.join(repoRoot, '.chocks'))

  if (command === 'context') {
    const { features, ignored } = await scanWithIgnored(root)
    if (ignored.length > 0) {
      console.error(
        `chocks: skipped ${ignored.length} markdown file(s) without the ${FEATURE_SUFFIX} suffix`,
      )
    }
    const output = formatContext(features)
    if (output) process.stdout.write(`${output}\n`)
    return
  }

  const port = Number(values.port ?? process.env.PORT ?? 2457)
  const host = values.host ?? '127.0.0.1'

  if (Number.isNaN(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${values.port}`)
    process.exitCode = 1
    return
  }

  const created = !existsSync(root)
  if (created) await mkdir(root, { recursive: true })

  const migration = await migrateLayout(root, repoRoot)
  if (migration.moved > 0) {
    console.log(`chocks: migrated ${migration.moved} feature file(s) to the current .chocks layout`)
  }

  // Hand-written files get their uid and sort key now. Done at startup rather than during
  // a read so that GETs stay free of side effects.
  const backfilled = await backfill(root)

  // A file named `auth.md` instead of `auth.chocks.md` would otherwise just not appear,
  // with nothing to explain why.
  const { ignored } = await scanWithIgnored(root)

  // Bad config falls back to the defaults rather than refusing to start, so without this
  // a misspelled colour is indistinguishable from a colour that does nothing.
  const { problems } = await loadConfig(root)

  // In the published package the UI sits next to the compiled server.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const uiDir = path.join(here, 'ui')

  const { version, repository } = ownPackage()
  const { app, stop } = createApp({
    root,
    repoRoot,
    name: path.basename(repoRoot),
    host,
    version,
    repository,
    uiDir,
  })

  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const { local, network } = urlsFor(host, info.port)

    console.log(`\n  chocks    ${local}`)
    for (const url of network) console.log(`  network   ${url}`)
    console.log(
      `  features  ${path.relative(process.cwd(), root) || root}${created ? '  (created)' : ''}`,
    )
    if (backfilled.uids > 0) {
      console.log(`  backfilled a stable id into ${backfilled.uids} feature file(s)`)
    }
    if (backfilled.sortKeys > 0) {
      console.log(`  backfilled a sort key into ${backfilled.sortKeys} feature file(s)`)
    }
    if (ignored.length > 0) {
      const names = ignored.map((file) => path.relative(root, file))
      console.log(
        `\n  Skipped ${ignored.length} markdown file(s) without the ${FEATURE_SUFFIX} suffix:` +
          `\n    ${names.slice(0, 5).join('\n    ')}` +
          (names.length > 5 ? `\n    …and ${names.length - 5} more` : ''),
      )
    }
    if (backfilled.failures.length > 0) {
      console.log(
        `\n  Could not write ${backfilled.failures.length} feature file(s). Links and` +
          ` reordering will not work for them until they are writable:` +
          `\n    ${backfilled.failures.join('\n    ')}`,
      )
    }
    if (problems.length > 0) {
      console.log(
        `\n  ${CONFIG_FILENAME} has ${problems.length} problem(s), using the defaults for those:` +
          `\n    ${problems.join('\n    ')}`,
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

  // Bind failures arrive here rather than on the promise above. A port already in use is
  // the one common enough to name, rather than making someone read a stack to find it.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\nchocks: port ${port} is already in use. Pass --port to pick another.`)
      process.exit(1)
    }
    reportFatal('could not start', error)
  })

  const shutdown = () => {
    // Watchers first, so a backfill mid-write finishes. See `stop` in server/app.
    void stop().finally(() => server.close(() => process.exit(0)))
    // Don't hang on a held-open SSE connection.
    setTimeout(() => process.exit(0), 500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

/**
 * Last resort for anything that escapes a handler.
 *
 * Node's own output for an unhandled rejection doesn't say which program produced it, and
 * a message with no stack rarely says enough to act on. Print both, name chocks, then let
 * it exit rather than carrying on in a state nothing planned for.
 */
function reportFatal(what: string, error: unknown): never {
  console.error(`\nchocks: ${what}`)
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
}

export function isDirectInvocation(entry = process.argv[1]): boolean {
  if (!entry) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry)
  } catch {
    return false
  }
}

if (isDirectInvocation()) {
  process.on('uncaughtException', (error) => reportFatal('crashed', error))
  process.on('unhandledRejection', (reason) => reportFatal('crashed', reason))
  main().catch((error: unknown) => reportFatal('could not start', error))
}
