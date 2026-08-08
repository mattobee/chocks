import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { FEATURE_SUFFIX } from '../lib/ids'
import type { Commit, FeatureHistory, HistoryUnavailable } from '../lib/types'
import { parseFeatureFile } from '../store/format'

const run = promisify(execFile)

/**
 * Reads a feature's history from git.
 *
 * chocks deliberately has no revision model of its own: the repo already records who
 * changed what and why, usually in the same commit as the code the feature describes.
 * This just surfaces it.
 */

// ASCII unit and record separators. Invisible in an editor, but they cannot occur in a
// commit subject or an author name, so splitting on them is exact.
const FIELD = ''
const RECORD = ''
const TIMEOUT = 5_000

async function git(repoRoot: string, args: string[]): Promise<string> {
  // execFile, never exec: arguments are passed as an array, so a path can never be
  // interpreted as shell syntax.
  const { stdout } = await run('git', ['-C', repoRoot, ...args], {
    timeout: TIMEOUT,
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout
}

/**
 * As `git`, but for a pathspec list long enough that passing it as argv is the risk, not
 * git itself: a glob like `src/**` can match tens of thousands of files in a large repo,
 * and execFile's argument array has to go through the OS the same way a shell command
 * line does, so it fails with E2BIG long before git would object to anything. Piped over
 * stdin instead, which has no such limit.
 *
 * Not `run`, the promisified helper: writing to stdin needs the real `ChildProcess`, which
 * `util.promisify` does not hand back.
 */
function gitWithPathsOnStdin(repoRoot: string, args: string[], paths: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['-C', repoRoot, ...args],
      { timeout: TIMEOUT, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
    // If git exits early — "not a git repository" doesn't wait to read stdin — the pipe
    // closes while writes are still queued, and the next write throws EPIPE. The callback
    // above already turns that exit into the rejection; without this handler, Node treats
    // the write's EPIPE as a second, unhandled error and crashes the process over it.
    child.stdin?.on('error', () => {})
    // `--` first marks everything after it as paths rather than revisions; see `--stdin`
    // in git-log(1).
    child.stdin?.write('--\n')
    for (const relative of paths) child.stdin?.write(`${relative}\n`)
    child.stdin?.end()
  })
}

/**
 * Commits touching `absoluteFile`, newest first.
 *
 * Uses `--follow`, which matters more here than in most tools: retitling a feature renames
 * its file and reparenting moves it, so without it a feature's history would appear to
 * start at its most recent move.
 */
export async function featureHistory(
  repoRoot: string,
  absoluteFile: string,
  limit = 30,
): Promise<FeatureHistory> {
  const relative = path.relative(repoRoot, absoluteFile).split(path.sep).join('/')
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    return { commits: [], tags: [], uncommitted: false, unavailable: 'failed' }
  }

  try {
    const [stdout, creationSha, commitBaseUrl] = await Promise.all([
      git(repoRoot, [
        'log',
        '--follow',
        `--max-count=${limit}`,
        `--format=${RECORD}%H${FIELD}%h${FIELD}%an${FIELD}%cI${FIELD}%s`,
        '--name-only',
        '--',
        relative,
      ]),
      git(repoRoot, ['log', '--follow', '--diff-filter=A', '--format=%H', '--', relative]),
      remoteCommitBaseUrl(repoRoot),
    ])
    const createdIn = creationSha.trim().split('\n').at(-1) ?? ''

    const commitData = stdout
      .split(RECORD)
      .map((record) => record.trim())
      .filter((record) => record !== '')
      .map((record) => {
        const [metadata = '', ...paths] = record.split('\n')
        const [sha = '', shortSha = '', author = '', date = '', subject = ''] =
          metadata.split(FIELD)
        return { sha, shortSha, author, date, subject, path: paths.at(-1)?.trim() ?? relative }
      })

    const statuses = await Promise.all(
      commitData.map((commit) => statusAtCommit(repoRoot, commit.sha, commit.path)),
    )
    const commits = commitData.map(({ path: _path, ...commit }, index) => {
      const status = statuses[index]
      const previous = statuses[index + 1] ?? null
      const statusChange =
        status !== null && commit.sha === createdIn
          ? status === ''
            ? undefined
            : { to: status }
          : status !== null && previous !== null && status !== previous
            ? {
                ...(previous !== '' ? { from: previous } : {}),
                ...(status !== '' ? { to: status } : {}),
              }
            : undefined
      return {
        ...commit,
        event: commit.sha === createdIn ? ('created' as const) : ('updated' as const),
        ...(statusChange && { statusChange }),
        ...(commitBaseUrl && { url: `${commitBaseUrl}${commit.sha}` }),
      }
    })

    const latest = commitData[0]
    const tags = latest
      ? await featureReleaseTags(repoRoot, createdIn, latest.sha, latest.date)
      : []
    return { commits, tags, uncommitted: await hasUncommittedChanges(repoRoot, relative) }
  } catch (error) {
    // A path git has never seen, or a repo with no commits at all, exits non-zero. That is
    // "no history yet" — the normal state of a feature you just created — not a failure.
    if (isMissingHistory(error)) {
      return { commits: [], tags: [], uncommitted: await hasUncommittedChanges(repoRoot, relative) }
    }
    return { commits: [], tags: [], uncommitted: false, unavailable: classify(error) }
  }
}

async function statusAtCommit(
  repoRoot: string,
  sha: string,
  relative: string,
): Promise<string | null> {
  try {
    return parseFeatureFile(await git(repoRoot, ['show', `${sha}:${relative}`]), '').status
  } catch {
    return null
  }
}

async function featureReleaseTags(
  repoRoot: string,
  creationSha: string,
  latestSha: string,
  latestDate: string,
): Promise<FeatureHistory['tags']> {
  const [first, current] = await Promise.all([
    firstTagContaining(repoRoot, creationSha),
    firstTagContaining(repoRoot, latestSha),
  ])
  if (!current) {
    return [
      ...(first ? [{ ...first, position: 'first' as const }] : []),
      { date: latestDate, position: 'unreleased' as const },
    ]
  }
  if (first?.name === current.name) return [{ ...current, position: 'only' }]
  return [
    ...(first ? [{ ...first, position: 'first' as const }] : []),
    { ...current, position: 'current' },
  ]
}

async function firstTagContaining(
  repoRoot: string,
  sha: string,
): Promise<{ name: string; date: string } | null> {
  if (sha === '') return null
  try {
    const stdout = await git(repoRoot, [
      'for-each-ref',
      '--merged=HEAD',
      `--contains=${sha}`,
      '--sort=version:refname',
      '--sort=creatordate',
      '--count=1',
      `--format=%(refname:short)${FIELD}%(creatordate:iso-strict)${RECORD}`,
      'refs/tags',
    ])
    const record = stdout.replace(RECORD, '').trim()
    if (record === '') return null
    const [name = '', date = ''] = record.split(FIELD)
    return { name, date }
  } catch {
    return null
  }
}

async function remoteCommitBaseUrl(repoRoot: string): Promise<string | null> {
  let remote: string
  try {
    remote = (await git(repoRoot, ['remote', 'get-url', 'origin'])).trim()
  } catch {
    return null
  }

  const scp = remote.match(/^[^@/:]+@([^:]+):(.+)$/)
  if (scp) remote = `https://${scp[1]}/${scp[2]}`
  else if (/^(?:git\+)?ssh:/.test(remote)) {
    try {
      const parsed = new URL(remote.replace(/^git\+/, ''))
      remote = `https://${parsed.hostname}${parsed.pathname}`
    } catch {
      return null
    }
  } else if (remote.startsWith('git+')) {
    remote = remote.slice('git+'.length)
  }

  let url: URL
  try {
    url = new URL(remote)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '')

  if (url.hostname === 'ssh.dev.azure.com') {
    const match = url.pathname.match(/^\/v3\/([^/]+)\/([^/]+)\/([^/]+)$/)
    if (!match) return null
    return `https://dev.azure.com/${match[1]}/${match[2]}/_git/${match[3]}/commit/`
  }
  if (url.hostname === 'dev.azure.com' || url.hostname.endsWith('.visualstudio.com')) {
    return `${url.toString().replace(/\/$/, '')}/commit/`
  }
  if (url.hostname === 'bitbucket.org') {
    return `${url.toString().replace(/\/$/, '')}/commits/`
  }
  if (url.hostname === 'gitlab.com') {
    return `${url.toString().replace(/\/$/, '')}/-/commit/`
  }
  if (
    ['github.com', 'codeberg.org', 'sr.ht'].includes(url.hostname) ||
    url.hostname.endsWith('.sr.ht')
  ) {
    return `${url.toString().replace(/\/$/, '')}/commit/`
  }
  return null
}

function isMissingHistory(error: unknown): boolean {
  const message = messageOf(error)
  return (
    /unknown revision or path not in the working tree/i.test(message) ||
    /does not have any commits yet/i.test(message) ||
    /ambiguous argument/i.test(message)
  )
}

/**
 * The most recent commit touching any of `paths`.
 *
 * A `code` glob can match several files at once, so this takes a pathspec list rather than
 * one file, and skips `--follow`: it only tracks a single path's renames, and which of
 * several matched files it would even apply to isn't well-defined. Callers degrade the
 * same way `featureHistory` does — this returns null rather than throwing, whatever the
 * reason git couldn't answer.
 */
export async function lastCommitTouching(
  repoRoot: string,
  paths: string[],
): Promise<Commit | null> {
  if (paths.length === 0) return null

  try {
    const stdout = await gitWithPathsOnStdin(
      repoRoot,
      ['log', '--stdin', '-1', `--format=%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%s`],
      paths,
    )
    const record = stdout.trim()
    if (record === '') return null
    const [sha = '', shortSha = '', author = '', date = '', subject = ''] = record.split(FIELD)
    return { sha, shortSha, author, date, subject }
  } catch {
    return null
  }
}

/**
 * Ids of every feature with changes that are not committed yet.
 *
 * Scoped to `root`, the chocks directory, not the whole repo: an edit elsewhere in the
 * checkout has nothing to do with a badge that promises to be about features. Config files
 * and anything else in `root` without the feature suffix are filtered out for the same
 * reason.
 */
export async function uncommittedFeatureIds(repoRoot: string, root: string): Promise<string[]> {
  const relative = path.relative(repoRoot, root).split(path.sep).join('/')
  if (relative.startsWith('..') || path.isAbsolute(relative)) return []

  // -z sidesteps two things the human-readable format does: quoting of paths with unusual
  // characters, and the "old -> new" arrow on a rename, which -z instead reports as two
  // separate NUL-terminated fields. --untracked-files=all expands a brand new subdirectory
  // into the files inside it, rather than reporting the directory itself as one opaque entry
  // that never matches the feature suffix.
  const args =
    relative === ''
      ? ['status', '--porcelain=v1', '-z', '--untracked-files=all']
      : ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', relative]

  let stdout: string
  try {
    stdout = await git(repoRoot, args)
  } catch {
    return []
  }

  const prefix = relative === '' ? '' : `${relative}/`
  const ids: string[] = []
  const fields = stdout.split('\0').filter((field) => field !== '')
  for (let index = 0; index < fields.length; index++) {
    const status = fields[index]!.slice(0, 2)
    const changedPath = fields[index]!.slice(3)
    // A rename or copy carries the old path as the following field; skip past it rather
    // than mistaking it for the next entry's status line.
    if (status.includes('R') || status.includes('C')) index++

    if (!changedPath.startsWith(prefix) || !changedPath.endsWith(FEATURE_SUFFIX)) continue
    let id = changedPath.slice(prefix.length, -FEATURE_SUFFIX.length)
    // A feature directory has an index.chocks.md inside it, not a file named after the
    // feature. Git reports the inner file, so strip that suffix to match the feature id.
    if (id.endsWith('/index')) id = id.slice(0, -'/index'.length)
    if (id === 'index') continue
    ids.push(id)
  }
  return ids
}

async function hasUncommittedChanges(repoRoot: string, relative: string): Promise<boolean> {
  try {
    // An empty pathspec matches nothing rather than everything, which comes up whenever the
    // chocks directory *is* the repo root: relative-to-itself is `''`.
    const args =
      relative === '' ? ['status', '--porcelain'] : ['status', '--porcelain', '--', relative]
    const stdout = await git(repoRoot, args)
    return stdout.trim() !== ''
  } catch {
    return false
  }
}

function messageOf(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const parts = [
    'message' in error ? String(error.message) : '',
    'stderr' in error ? String(error.stderr) : '',
  ]
  return parts.join('\n')
}

function classify(error: unknown): HistoryUnavailable {
  const message = messageOf(error)
  if (/ENOENT/.test(message) && /spawn git/i.test(message)) return 'git-missing'
  if (/not a git repository/i.test(message)) return 'not-a-repo'
  return 'failed'
}

/** True when `dir` is inside a git working tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const stdout = await git(dir, ['rev-parse', '--is-inside-work-tree'])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}
