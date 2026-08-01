import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { test as base, expect } from '@playwright/test'

const run = promisify(execFile)
const REPO_ROOT = path.resolve(import.meta.dirname, '..')

/** A throwaway git repo with chocks running against it. */
export interface Workspace {
  /** Repo root. */
  dir: string
  /** The `.chocks` directory inside it. */
  chocks: string
  url: string
  git: (...args: string[]) => Promise<string>
  /** Commits everything, so history and the uncommitted badge have something to show. */
  commit: (message: string) => Promise<void>
  read: (id: string) => Promise<string>
  write: (id: string, contents: string) => Promise<void>
  /** Paths git reports as modified, relative to the repo. */
  changed: () => Promise<string[]>
}

/**
 * The port chocks actually bound, read from what it printed.
 *
 * Deliberately not chosen in advance. Picking a free port means binding one, reading the
 * number and letting go of it, and another worker can take it in the gap before chocks
 * binds. That server then exits, and every request in that test is refused — which looks
 * exactly like a feature that has gone missing.
 *
 * Passing `--port 0` lets the OS assign one to chocks itself, so there is no gap.
 */
function portFromOutput(server: ChildProcess, output: () => string): Promise<number> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`chocks printed no port in 20s:\n${output()}`)),
      20_000,
    )
    const check = () => {
      const match = /http:\/\/localhost:(\d+)/.exec(output())
      if (!match?.[1]) return
      clearTimeout(deadline)
      clearInterval(poll)
      resolve(Number(match[1]))
    }
    const poll = setInterval(check, 50)
    server.on('exit', (code) => {
      clearTimeout(deadline)
      clearInterval(poll)
      reject(new Error(`chocks exited with ${code} before listening:\n${output()}`))
    })
  })
}

async function waitForServer(url: string, timeout = 20_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/workspace`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`chocks did not start at ${url}`)
}

// uids must be ten hex characters starting with a letter, or the server treats them as
// missing and backfills real ones at startup, which dirties the repo before a test runs.
const SEED = [
  ['auth', 'Authentication', 'released', 'a0', 'aaa0000001'],
  ['auth/oauth', 'OAuth providers', 'pre-release', 'a0', 'aaa0000002'],
  ['auth/oauth/github', 'GitHub', 'released', 'a0', 'aaa0000003'],
  ['auth/oauth/google', 'Google', 'planned', 'a1', 'aaa0000004'],
  ['billing', 'Billing', 'idea', 'a1', 'aaa0000005'],
] as const

export const test = base.extend<{ workspace: Workspace }>({
  workspace: async ({}, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'chocks-e2e-'))
    const chocks = path.join(dir, '.chocks')

    const git = async (...args: string[]) => {
      const { stdout } = await run('git', ['-C', dir, ...args])
      return stdout
    }

    await git('init', '-q', '-b', 'main')
    await git('config', 'user.email', 'e2e@example.com')
    await git('config', 'user.name', 'End To End')
    // Signing would prompt, and these commits are throwaway.
    await git('config', 'commit.gpgsign', 'false')

    for (const [id, title, status, sort, uid] of SEED) {
      const file = path.join(chocks, `${id}.feature.md`)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(
        file,
        `---\ntitle: ${title}\nstatus: ${status}\nsort: ${sort}\nuid: ${uid}\n---\n\nSeeded.\n`,
        'utf8',
      )
    }

    const commit = async (message: string) => {
      await git('add', '-A')
      await git('commit', '-q', '-m', message)
    }
    await commit('seed')

    const cli = path.join(REPO_ROOT, 'dist', 'cli.mjs')
    if (!existsSync(cli)) {
      throw new Error('dist/cli.mjs is missing. Run `pnpm build` before the e2e suite.')
    }

    let server: ChildProcess | undefined
    let url = ''
    try {
      // Piped, not ignored: when the server does fail, its own message is the only thing
      // that says why, and throwing it away turns a clear error into a mystery.
      server = spawn('node', [cli, '--no-open', '--port', '0'], { cwd: dir, stdio: 'pipe' })
      let output = ''
      server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
      server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))

      url = `http://127.0.0.1:${await portFromOutput(server, () => output)}`
      await waitForServer(url)

      await use({
        dir,
        chocks,
        url,
        git,
        commit,
        read: (id) => readFile(path.join(chocks, `${id}.feature.md`), 'utf8'),
        write: (id, contents) => writeFile(path.join(chocks, `${id}.feature.md`), contents, 'utf8'),
        changed: async () =>
          (await git('status', '--porcelain'))
            .split('\n')
            .map((line) => line.slice(3).trim())
            .filter(Boolean),
      })
    } finally {
      server?.kill('SIGTERM')
      await rm(dir, { recursive: true, force: true })
    }
  },
})

export { expect }
