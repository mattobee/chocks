import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { watchFeatures, watchGit } from './watch'

let root: string
let stop: (() => void) | undefined

beforeEach(async () => {
  // Named `.chocks` on purpose: the real root is a dotfile directory, and a naive
  // "ignore anything with a dot in the path" filter silently ignores the whole tree.
  const parent = await mkdtemp(path.join(tmpdir(), 'chocks-watch-'))
  root = path.join(parent, '.chocks')
  await mkdir(root, { recursive: true })
})

afterEach(async () => {
  stop?.()
  stop = undefined
  await rm(path.dirname(root), { recursive: true, force: true })
})

/** Resolves when onChange fires, or rejects after `timeout`. */
function nextChange(timeout = 3000): { promise: Promise<void>; fire: () => void } {
  let fire!: () => void
  const promise = new Promise<void>((resolve, reject) => {
    fire = resolve
    setTimeout(() => reject(new Error('watcher did not fire')), timeout).unref?.()
  })
  return { promise, fire }
}

describe('watchFeatures', () => {
  it('fires when a feature file inside a dot-directory root changes', async () => {
    const file = path.join(root, 'auth.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')

    const { promise, fire } = nextChange()
    stop = watchFeatures(root, fire)
    // Give chokidar a moment to finish its initial scan before touching anything.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(file, '---\ntitle: Changed\n---\n', 'utf8')

    await expect(promise).resolves.toBeUndefined()
  })

  it('fires when a nested feature file is added', async () => {
    await mkdir(path.join(root, 'auth'), { recursive: true })
    const { promise, fire } = nextChange()
    stop = watchFeatures(root, fire)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(path.join(root, 'auth', 'oauth.md'), '---\ntitle: OAuth\n---\n', 'utf8')

    await expect(promise).resolves.toBeUndefined()
  })

  it('stops firing once torn down', async () => {
    let calls = 0
    const teardown = watchFeatures(root, () => calls++)
    await new Promise((resolve) => setTimeout(resolve, 300))
    teardown()

    await writeFile(path.join(root, 'late.md'), '---\ntitle: Late\n---\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(calls).toBe(0)
  })
})

describe('watchGit', () => {
  const run = promisify(execFile)
  let repo: string
  let teardown: (() => void) | undefined

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'chocks-gitwatch-'))
    await run('git', ['-C', repo, 'init', '-q', '-b', 'main'])
  })

  afterEach(async () => {
    teardown?.()
    teardown = undefined
    await rm(repo, { recursive: true, force: true })
  })

  async function commit(message: string, file: string, contents: string): Promise<void> {
    await writeFile(path.join(repo, file), contents, 'utf8')
    await run('git', ['-C', repo, 'add', '-A'])
    await run('git', [
      '-C',
      repo,
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=Tester',
      'commit',
      '-m',
      message,
    ])
  }

  it('fires on a commit, which never touches the feature files', async () => {
    // Commit once first, so `.git/index` already exists when the watcher starts. Watching
    // a not-yet-created file takes a different path through chokidar and passed even when
    // the real case — an existing index replaced by rename — did not.
    await commit('first', 'a.txt', 'one')

    const { promise, fire } = nextChange()
    teardown = watchGit(repo, fire)
    await new Promise((resolve) => setTimeout(resolve, 400))

    await commit('second', 'a.txt', 'two')

    await expect(promise).resolves.toBeUndefined()
  })

  it('fires on a branch switch', async () => {
    await commit('first', 'a.txt', 'one')
    await run('git', ['-C', repo, 'branch', 'other'])

    const { promise, fire } = nextChange()
    teardown = watchGit(repo, fire)
    await new Promise((resolve) => setTimeout(resolve, 400))

    await run('git', ['-C', repo, 'checkout', '-q', 'other'])

    await expect(promise).resolves.toBeUndefined()
  })

  it('is a no-op outside a repo rather than throwing', async () => {
    const loose = await mkdtemp(path.join(tmpdir(), 'chocks-loose-'))
    try {
      const stop = watchGit(loose, () => {
        throw new Error('should never fire')
      })
      expect(typeof stop).toBe('function')
      stop()
    } finally {
      await rm(loose, { recursive: true, force: true })
    }
  })

  it('watches a real linked worktree', async () => {
    const worktreeDir = await mkdtemp(path.join(tmpdir(), 'chocks-worktree-'))
    try {
      await run('git', ['-C', repo, 'worktree', 'add', '-q', worktreeDir, '-b', 'wt-branch'])

      const { promise, fire } = nextChange()
      teardown = watchGit(worktreeDir, fire)
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Commit inside the worktree
      await writeFile(path.join(worktreeDir, 'wt.txt'), 'hello', 'utf8')
      await run('git', ['-C', worktreeDir, 'add', '-A'])
      await run('git', [
        '-C',
        worktreeDir,
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=Tester',
        'commit',
        '-m',
        'worktree commit',
      ])

      await expect(promise).resolves.toBeUndefined()
    } finally {
      await run('git', ['-C', repo, 'worktree', 'remove', '-f', worktreeDir]).catch(() => {})
      await rm(worktreeDir, { recursive: true, force: true })
    }
  })
})
