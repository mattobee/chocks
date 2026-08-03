import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLayout } from './migrate'

const run = promisify(execFile)
let repo: string
let root: string

async function given(relativePath: string, title: string): Promise<void> {
  const file = path.join(root, relativePath)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `---\ntitle: ${title}\nuid: aaa0000001\nsort: a0\n---\n`, 'utf8')
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'chocks-migrate-'))
  root = path.join(repo, '.chocks')
  await mkdir(root)
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('migrateLayout', () => {
  it('rejects a symlinked root before moving files', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-migrate-outside-'))
    await rm(root, { recursive: true })
    await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(path.join(outside, 'auth.chocks.md'), 'auth', 'utf8')
    await mkdir(path.join(outside, 'auth'))

    try {
      await expect(migrateLayout(root, repo)).rejects.toThrow(/Symbolic links/)
      expect(existsSync(path.join(outside, 'auth.chocks.md'))).toBe(true)
      expect(existsSync(path.join(outside, 'auth', 'index.chocks.md'))).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('moves old sibling layouts and renames both old extensions', async () => {
    await given('auth.chocks.md', 'Auth')
    await given('auth/oauth.feature.md', 'OAuth')
    await mkdir(path.join(root, 'auth', 'oauth'))
    await given('billing.feature.md', 'Billing')

    const result = await migrateLayout(root, repo)

    expect(result).toEqual({ moved: 3, usedGit: false })
    expect(await readFile(path.join(root, 'auth', 'index.chocks.md'), 'utf8')).toContain(
      'title: Auth',
    )
    expect(await readFile(path.join(root, 'auth', 'oauth', 'index.chocks.md'), 'utf8')).toContain(
      'title: OAuth',
    )
    expect(existsSync(path.join(root, 'billing.chocks.md'))).toBe(true)
    expect(await migrateLayout(root, repo)).toEqual({ moved: 0, usedGit: false })
  })

  it('uses filesystem moves for ignored untracked features in a clean repository', async () => {
    await run('git', ['-C', repo, 'init', '-q', '-b', 'main'])
    await writeFile(path.join(repo, '.gitignore'), '.chocks/\n', 'utf8')
    await run('git', ['-C', repo, 'add', '.gitignore'])
    await run('git', [
      '-C',
      repo,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '-q',
      '-m',
      'ignore chocks',
    ])
    await given('auth.chocks.md', 'Auth')
    await mkdir(path.join(root, 'auth'))

    expect(await migrateLayout(root, repo)).toEqual({ moved: 1, usedGit: false })
    expect(existsSync(path.join(root, 'auth', 'index.chocks.md'))).toBe(true)
  })

  it('disambiguates reserved index features before creating parent indexes', async () => {
    await given('auth.chocks.md', 'Auth')
    await given('auth/index.chocks.md', 'Index child')
    await given('index.feature.md', 'Root index')

    expect(await migrateLayout(root, repo)).toEqual({ moved: 3, usedGit: false })
    expect(await readFile(path.join(root, 'auth', 'index.chocks.md'), 'utf8')).toContain(
      'title: Auth',
    )
    expect(await readFile(path.join(root, 'auth', 'index-2.chocks.md'), 'utf8')).toContain(
      'title: Index child',
    )
    expect(await readFile(path.join(root, 'index-2.chocks.md'), 'utf8')).toContain(
      'title: Root index',
    )
  })

  it('rejects two legacy files that map to one destination', async () => {
    await given('auth.chocks.md', 'Auth')
    await given('auth.feature.md', 'Other auth')
    await mkdir(path.join(root, 'auth'))

    await expect(migrateLayout(root, repo)).rejects.toThrow(/more than one feature maps/)
    expect(existsSync(path.join(root, 'auth.chocks.md'))).toBe(true)
    expect(existsSync(path.join(root, 'auth.feature.md'))).toBe(true)
  })

  it('uses git mv when the repository is clean', async () => {
    await run('git', ['-C', repo, 'init', '-q', '-b', 'main'])
    await given('auth.chocks.md', 'Auth')
    await mkdir(path.join(root, 'auth'))
    await run('git', ['-C', repo, 'add', '-A'])
    await run('git', [
      '-C',
      repo,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '-q',
      '-m',
      'seed',
    ])

    expect(await migrateLayout(root, repo)).toEqual({ moved: 1, usedGit: true })
    const { stdout } = await run('git', ['-C', repo, 'status', '--short'])
    expect(stdout).toContain('R  .chocks/auth.chocks.md -> .chocks/auth/index.chocks.md')
  })
})
