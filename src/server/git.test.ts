import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { featureHistory, isGitRepo, lastCommitTouching, uncommittedFeatureIds } from './git'

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
    await writeFile(file, '---\ntitle: Auth\nstatus: planned\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    await commit('feat: ship auth')

    const history = await featureHistory(repo, file)
    expect(history.unavailable).toBeUndefined()
    expect(history.commits.map((entry) => entry.subject)).toEqual([
      'feat: ship auth',
      'feat: add auth',
    ])
    expect(history.commits.map((entry) => entry.event)).toEqual(['updated', 'created'])
    expect(history.commits.map((entry) => entry.statusChange)).toEqual([
      { from: 'planned', to: 'released' },
      { to: 'planned' },
    ])
    expect(history.tags).toMatchObject([{ position: 'unreleased' }])
    expect(history.commits[0]?.author).toBe('Tester')
    expect(history.commits[0]?.shortSha).toHaveLength(7)
    expect(new Date(history.commits[0]!.date).getTime()).toBeGreaterThan(0)
    expect(history.commits[0]?.url).toBeUndefined()
  })

  it('uses commit date rather than author date', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await git('add', '-A')
    await run(
      'git',
      [
        '-C',
        repo,
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=Tester',
        'commit',
        '-m',
        'add auth',
      ],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
          GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
        },
      },
    )

    expect(new Date((await featureHistory(repo, file)).commits[0]!.date).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it.each([
    ['git@github.com:acme/widgets.git', 'https://github.com/acme/widgets/commit/'],
    ['https://gitlab.com/acme/widgets.git', 'https://gitlab.com/acme/widgets/-/commit/'],
    ['git@bitbucket.org:acme/widgets.git', 'https://bitbucket.org/acme/widgets/commits/'],
    [
      'git@ssh.dev.azure.com:v3/acme/widgets/app',
      'https://dev.azure.com/acme/widgets/_git/app/commit/',
    ],
  ])('links commits for remote %s', async (remote, expectedBase) => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await git('remote', 'add', 'origin', remote)

    const history = await featureHistory(repo, file)
    expect(history.commits[0]?.url).toBe(`${expectedBase}${history.commits[0]?.sha}`)
  })

  it('leaves commits unlinked for an unknown forge', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await git('remote', 'add', 'origin', 'https://git.example.com/acme/widgets.git')

    expect((await featureHistory(repo, file)).commits[0]?.url).toBeUndefined()
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
    expect(history.commits.map((entry) => entry.event)).toEqual(['updated', 'created'])
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

  it('reads a status transition across a rename', async () => {
    const before = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(before, '---\ntitle: Auth\nstatus: planned\n---\n', 'utf8')
    await commit('feat: add auth')
    const after = path.join(repo, '.chocks', 'authentication.chocks.md')
    await rename(before, after)
    await commit('refactor: rename auth')
    await writeFile(after, '---\ntitle: Authentication\nstatus: released\n---\n', 'utf8')
    await commit('feat: ship auth')

    const history = await featureHistory(repo, after)
    expect(history.commits.map((entry) => entry.statusChange)).toEqual([
      { from: 'planned', to: 'released' },
      undefined,
      { to: 'planned' },
    ])
  })

  it('represents setting and removing a previously absent status', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(file, '---\ntitle: Auth\nstatus: planned\n---\n', 'utf8')
    await commit('feat: plan auth')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('chore: clear auth status')

    const history = await featureHistory(repo, file)
    expect(history.commits.map((entry) => entry.statusChange)).toEqual([
      { from: 'planned' },
      { to: 'planned' },
      undefined,
    ])
  })

  it('preserves an unknown status in a transition', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\nstatus: experimental\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    await commit('feat: ship auth')

    expect((await featureHistory(repo, file)).commits[0]?.statusChange).toEqual({
      from: 'experimental',
      to: 'released',
    })
  })

  it('omits an annotation when a commit does not change status', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\nstatus: planned\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(file, '---\ntitle: Authentication\nstatus: planned\n---\n', 'utf8')
    await commit('docs: clarify auth')

    const history = await featureHistory(repo, file)
    expect(history.commits[0]?.statusChange).toBeUndefined()
    expect(history.commits[1]?.statusChange).toEqual({ to: 'planned' })
  })

  it('uses an annotated tag as a release boundary', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await git(
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=Tester',
      'tag',
      '-a',
      'v1.0.0',
      '-m',
      'Stable release',
    )

    expect((await featureHistory(repo, file)).tags).toMatchObject([
      { name: 'v1.0.0', position: 'only' },
    ])
  })

  it('includes a tag created by a later release commit', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await writeFile(path.join(repo, 'CHANGELOG.md'), '# 1.0.0\n', 'utf8')
    await commit('release: v1.0.0')
    await git('tag', 'v1.0.0')

    const history = await featureHistory(repo, file)
    expect(history.tags[0]).toMatchObject({ name: 'v1.0.0', position: 'only' })
    expect(new Date(history.tags[0]!.date).getTime()).toBeGreaterThan(0)
  })

  it('finds the first release and the first release containing the latest change', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')

    await writeFile(path.join(repo, 'VERSION'), 'v1.0.0\n', 'utf8')
    await commit('release: v1.0.0')
    await git('tag', 'v1.0.0')
    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    await commit('feat: update auth')
    await writeFile(path.join(repo, 'VERSION'), 'v1.1.0\n', 'utf8')
    await commit('release: v1.1.0')
    await git('tag', 'v1.1.0')
    await writeFile(path.join(repo, 'VERSION'), 'v2.0.0\n', 'utf8')
    await commit('release: v2.0.0')
    await git('tag', 'v2.0.0')

    expect((await featureHistory(repo, file)).tags).toMatchObject([
      { name: 'v1.0.0', position: 'first' },
      { name: 'v1.1.0', position: 'current' },
    ])
  })

  it('reports when the latest feature change is not released', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    await git('tag', 'v1.0.0')
    await writeFile(file, '---\ntitle: Auth\nstatus: released\n---\n', 'utf8')
    await commit('feat: update auth')

    expect((await featureHistory(repo, file)).tags).toMatchObject([
      { name: 'v1.0.0', position: 'first' },
      { position: 'unreleased' },
    ])
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
    expect(
      (await featureHistory(repo, file, 3)).commits.every((entry) => entry.event === 'updated'),
    ).toBe(true)
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

describe('lastCommitTouching', () => {
  it('finds the commit touching a single path', async () => {
    const file = path.join(repo, 'auth.ts')
    await writeFile(file, '', 'utf8')
    await commit('feat: add auth')

    const commit_ = await lastCommitTouching(repo, ['auth.ts'])
    expect(commit_?.subject).toBe('feat: add auth')
  })

  it('returns null for a path with no history', async () => {
    await writeFile(path.join(repo, 'auth.ts'), '', 'utf8')
    expect(await lastCommitTouching(repo, ['auth.ts'])).toBeNull()
  })

  it('returns null for an empty path list without asking git', async () => {
    expect(await lastCommitTouching(repo, [])).toBeNull()
  })

  it('returns null rather than throwing when the repo has no commits', async () => {
    expect(await lastCommitTouching(repo, ['nothing-committed-yet.ts'])).toBeNull()
  })

  // The regression this guards: a `code` glob can match far more files than fit on one
  // command line, and passing them as execFile arguments hits the OS's own E2BIG rather
  // than anything git enforces — this used to fail silently into a caught error and a
  // blank "Changed" column. A few thousand paths, well past a typical ARG_MAX, is enough
  // to prove they go over stdin instead.
  it('does not fail with a very large number of paths', async () => {
    const file = path.join(repo, 'auth.ts')
    await writeFile(file, '', 'utf8')
    await commit('feat: add auth')

    const manyPaths = Array.from({ length: 50_000 }, (_, index) => `generated/file-${index}.ts`)
    const commit_ = await lastCommitTouching(repo, [...manyPaths, 'auth.ts'])
    expect(commit_?.subject).toBe('feat: add auth')
  })
})

describe('uncommittedFeatureIds', () => {
  it('is empty with nothing but committed features', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual([])
  })

  it('lists every changed feature, not just one', async () => {
    const auth = path.join(repo, '.chocks', 'auth.chocks.md')
    const oauth = path.join(repo, '.chocks', 'oauth.chocks.md')
    await writeFile(auth, '---\ntitle: Auth\n---\n', 'utf8')
    await writeFile(oauth, '---\ntitle: OAuth\n---\n', 'utf8')
    await commit('feat: add auth and oauth')

    await writeFile(oauth, '---\ntitle: OAuth\nstatus: released\n---\n', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual(['oauth'])
  })

  it('reports a nested feature by its full id', async () => {
    await mkdir(path.join(repo, '.chocks', 'auth'), { recursive: true })
    const oauth = path.join(repo, '.chocks', 'auth', 'oauth.chocks.md')
    await writeFile(oauth, '---\ntitle: OAuth\n---\n', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual(['auth/oauth'])
  })

  it('reports a directory feature by its id, not index/index', async () => {
    await mkdir(path.join(repo, '.chocks', 'auth'), { recursive: true })
    const file = path.join(repo, '.chocks', 'auth', 'index.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual(['auth'])
  })

  it('ignores a bare index.chocks.md that is not a feature', async () => {
    const file = path.join(repo, '.chocks', 'index.chocks.md')
    await writeFile(file, '---\ntitle: Root\n---\n', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual([])
  })

  it('ignores an edit outside the chocks directory', async () => {
    const file = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')

    await writeFile(path.join(repo, 'README.md'), 'unrelated edit', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual([])
  })

  it('ignores a non-feature file inside the chocks directory', async () => {
    await writeFile(path.join(repo, '.chocks', 'config.yaml'), 'statuses: []', 'utf8')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual([])
  })

  it('reports the new id of a renamed feature, not the old one', async () => {
    const before = path.join(repo, '.chocks', 'auth.chocks.md')
    await writeFile(before, '---\ntitle: Auth\n---\n', 'utf8')
    await commit('feat: add auth')

    await rename(before, path.join(repo, '.chocks', 'authentication.chocks.md'))
    await git('add', '-A')
    expect(await uncommittedFeatureIds(repo, path.join(repo, '.chocks'))).toEqual([
      'authentication',
    ])
  })

  it('is empty outside a repo rather than throwing', async () => {
    const loose = await mkdtemp(path.join(tmpdir(), 'chocks-loose-'))
    try {
      expect(await uncommittedFeatureIds(loose, loose)).toEqual([])
    } finally {
      await rm(loose, { recursive: true, force: true })
    }
  })

  it('is empty for a chocks directory outside the repo', async () => {
    expect(await uncommittedFeatureIds(repo, '/etc')).toEqual([])
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
