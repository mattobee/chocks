import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { featureHistory, isGitRepo } from './git'

const run = promisify(execFile)

let repo: string

async function git(...args: string[]): Promise<void> {
  await run('git', ['-C', repo, ...args])
}

async function commit(message: string): Promise<void> {
  await git('add', '-A')
  await git('-c', 'user.email=t@example.com', '-c', 'user.name=Tester', 'commit', '-m', message)
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'chocks-git-'))
  await run('git', ['-C', repo, 'init', '-q', '-b', 'main'])
  await mkdir(path.join(repo, '.chocks'), { recursive: true })
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('featureHistory', () => {
  it('returns commits newest first', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    await commit('feat: ship auth')

    const history = await featureHistory(repo, file)
    expect(history.unavailable).toBeUndefined()
    expect(history.commits.map((entry) => entry.subject)).toEqual([
      'feat: ship auth',
      'feat: add auth',
    ])
    expect(history.commits[0]?.author).toBe('Tester')
    expect(history.commits[0]?.shortSha).toHaveLength(7)
    expect(new Date(history.commits[0]!.date).getTime()).toBeGreaterThan(0)
  })

  it('follows a parent index across a directory rename', async () => {
    const beforeDirectory = path.join(repo, '.chocks', 'auth')
    await mkdir(beforeDirectory)
    const before = path.join(beforeDirectory, 'index.chocks.md')
    await writeFile(before, '---\ntitle: Auth\n---\n', 'utf8')
    await writeFile(
      path.join(beforeDirectory, 'oauth.chocks.md'),
      '---\ntitle: OAuth\n---\n',
      'utf8',
    )
    await commit('feat: add auth')

    const afterDirectory = path.join(repo, '.chocks', 'authentication')
    await rename(beforeDirectory, afterDirectory)
    await commit('refactor: retitle auth')

    const history = await featureHistory(repo, path.join(afterDirectory, 'index.chocks.md'))
    expect(history.commits.map((entry) => entry.subject)).toEqual([
      'refactor: retitle auth',
      'feat: add auth',
    ])
  })

  it('follows the file across a reparent', async () => {
    const before = path.join(repo, '.chocks', 'oauth.chocks.md')
    await writeFile(before, '---\ntitle: OAuth\n---\n', 'utf8')
    await commit('feat: add oauth')

    await mkdir(path.join(repo, '.chocks', 'auth'), { recursive: true })
    const after = path.join(repo, '.chocks', 'auth', 'oauth.chocks.md')
    await rename(before, after)
    await commit('refactor: nest oauth under auth')

    const history = await featureHistory(repo, after)
    expect(history.commits).toHaveLength(2)
  })

  it('reports an uncommitted edit', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    expect((await featureHistory(repo, file)).uncommitted).toBe(false)

    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    expect((await featureHistory(repo, file)).uncommitted).toBe(true)
  })

  it('returns nothing for a file that was never committed', async () => {
    const file = path.join(repo, '.chocks', 'fresh.chocks.md')
    await writeFile(file, '---\ntitle: Fresh\n---\n', 'utf8')

    const history = await featureHistory(repo, file)
    expect(history.commits).toEqual([])
    expect(history.unavailable).toBeUndefined()
    expect(history.uncommitted).toBe(true)
  })

  it('honours the commit limit', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    for (let index = 0; index < 5; index++) {
      await writeFile(file, `---\ntitle: Auth ${index}\n---\n`, 'utf8')
      await commit(`chore: edit ${index}`)
    }
    expect((await featureHistory(repo, file, 3)).commits).toHaveLength(3)
  })

  it('preserves a subject containing the field separators', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: handle a|b and c\td')
    expect((await featureHistory(repo, file)).commits[0]?.subject).toBe('feat: handle a|b and c\td')
  })

  it('reports rather than throws outside a repo', async () => {
    const loose = await mkdtemp(path.join(tmpdir(), 'chocks-loose-'))
    try {
      const file = path.join(loose, 'auth.chocks.md')
      await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
      const history = await featureHistory(loose, file)
      expect(history.commits).toEqual([])
      expect(history.unavailable).toBe('not-a-repo')
    } finally {
      await rm(loose, { recursive: true, force: true })
    }
  })

  it('refuses a file outside the repo', async () => {
    const history = await featureHistory(repo, '/etc/passwd')
    expect(history.unavailable).toBe('failed')
    expect(history.commits).toEqual([])
  })
})

describe('isGitRepo', () => {
  it('detects a repo', async () => {
    expect(await isGitRepo(repo)).toBe(true)
  })

  it('detects a plain directory', async () => {
    const loose = await mkdtemp(path.join(tmpdir(), 'chocks-loose-'))
    try {
      expect(await isGitRepo(loose)).toBe(false)
    } finally {
      await rm(loose, { recursive: true, force: true })
    }
  })
})
