import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
