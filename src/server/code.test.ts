import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { matchCodeRefs } from './code'

const run = promisify(execFile)

let repo: string

async function file(relativePath: string, contents = ''): Promise<void> {
  const target = path.join(repo, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, contents, 'utf8')
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'chocks-code-'))
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('matchCodeRefs', () => {
  it('counts a literal path as one match or zero', async () => {
    await file('src/auth.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/auth.ts' }, { path: 'src/missing.ts' }])
    expect(matches).toEqual([
      { path: 'src/auth.ts', count: 1, lastCommit: null },
      { path: 'src/missing.ts', count: 0, lastCommit: null },
    ])
  })

  it('counts a literal path to a directory as one match', async () => {
    await file('src/auth/index.ts')
    expect(await matchCodeRefs(repo, [{ path: 'src/auth' }])).toEqual([
      { path: 'src/auth', count: 1, lastCommit: null },
    ])
  })

  it('matches * within a single path segment', async () => {
    await file('src/store/format.ts')
    await file('src/store/format.test.ts')
    await file('src/store/store.test.ts')
    await file('src/store/nested/deep.test.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/store/*.test.ts' }])
    expect(matches).toEqual([{ path: 'src/store/*.test.ts', count: 2, lastCommit: null }])
  })

  it('matches ** across any number of segments, including zero', async () => {
    await file('src/format.ts')
    await file('src/store/format.ts')
    await file('src/store/nested/format.ts')
    await file('src/store/format.tsx')
    const matches = await matchCodeRefs(repo, [{ path: 'src/**/format.ts' }])
    expect(matches[0]?.count).toBe(3)
  })

  it('matches a trailing ** to everything underneath', async () => {
    await file('src/notifications/send.ts')
    await file('src/notifications/nested/digest.ts')
    await file('src/billing/invoice.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/notifications/**' }])
    expect(matches[0]?.count).toBe(2)
  })

  it('matches ? as exactly one character', async () => {
    await file('src/a.ts')
    await file('src/ab.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/?.ts' }])
    expect(matches[0]?.count).toBe(1)
  })

  it('treats a regex-special character in the path as literal', async () => {
    await file('src/a+b.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/a+b.ts' }])
    expect(matches[0]?.count).toBe(1)
  })

  it('skips a flag entry rather than reporting it as zero', async () => {
    const matches = await matchCodeRefs(repo, [{ path: 'new-onboarding', kind: 'flag' }])
    expect(matches).toEqual([{ path: 'new-onboarding', count: null, lastCommit: null }])
  })

  it('ignores .git and node_modules while walking', async () => {
    await file('.git/HEAD')
    await file('node_modules/pkg/index.ts')
    await file('src/index.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/**' }, { path: '**/index.ts' }])
    expect(matches[0]?.count).toBe(1)
    // Only src/index.ts, not the one inside node_modules.
    expect(matches[1]?.count).toBe(1)
  })

  it('does not follow a symlink out of the repo', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'chocks-code-outside-'))
    await writeFile(path.join(outside, 'secret.ts'), '', 'utf8')
    await symlink(outside, path.join(repo, 'linked'))
    try {
      // The symlink itself is a real repo-relative entry, so a literal path to it still
      // counts as one match. What must not happen is following it: nothing on the other
      // side is walked or counted.
      const matches = await matchCodeRefs(repo, [{ path: 'linked/**' }, { path: 'linked' }])
      expect(matches[0]?.count).toBe(0)
      expect(matches[1]?.count).toBe(1)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('resolves a literal path that escapes the repo to no match, not the real file', async () => {
    const matches = await matchCodeRefs(repo, [{ path: '../../../etc/passwd' }])
    expect(matches).toEqual([{ path: '../../../etc/passwd', count: 0, lastCommit: null }])
  })

  it('returns an empty list for an empty code list', async () => {
    expect(await matchCodeRefs(repo, [])).toEqual([])
  })

  it('leaves lastCommit null when there is nothing to check it against', async () => {
    // repo isn't a git repository at all, matching every fixture above; the point of a
    // dedicated case is documenting that this is null rather than a thrown error.
    await file('src/auth.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/auth.ts' }])
    expect(matches[0]?.lastCommit).toBeNull()
  })
})

describe('matchCodeRefs with git history', () => {
  async function git(...args: string[]): Promise<void> {
    await run('git', ['-C', repo, ...args])
  }

  async function commit(message: string): Promise<void> {
    await git('add', '-A')
    await git('-c', 'user.email=t@example.com', '-c', 'user.name=Tester', 'commit', '-m', message)
  }

  beforeEach(async () => {
    await git('init', '-q', '-b', 'main')
  })

  it('finds the last commit touching a literal path', async () => {
    await file('src/auth.ts', 'v1')
    await commit('feat: add auth')
    await file('src/other.ts')
    await commit('feat: add other')

    const matches = await matchCodeRefs(repo, [{ path: 'src/auth.ts' }])
    expect(matches[0]?.lastCommit?.subject).toBe('feat: add auth')
  })

  it('picks the most recent commit across every file a glob matched', async () => {
    await file('src/store/format.ts')
    await file('src/store/format.test.ts')
    await commit('feat: add format')
    await file('src/store/store.test.ts')
    await commit('feat: add store tests')

    const matches = await matchCodeRefs(repo, [{ path: 'src/store/*.test.ts' }])
    expect(matches[0]?.count).toBe(2)
    expect(matches[0]?.lastCommit?.subject).toBe('feat: add store tests')
  })

  it('returns null for an untracked file with no commits yet', async () => {
    await file('src/auth.ts')
    const matches = await matchCodeRefs(repo, [{ path: 'src/auth.ts' }])
    expect(matches[0]?.count).toBe(1)
    expect(matches[0]?.lastCommit).toBeNull()
  })

  it('still leaves a flag entry null, git repo or not', async () => {
    const matches = await matchCodeRefs(repo, [{ path: 'new-onboarding', kind: 'flag' }])
    expect(matches).toEqual([{ path: 'new-onboarding', count: null, lastCommit: null }])
  })
})
