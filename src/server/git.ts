import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FeatureHistory, HistoryUnavailable } from '../lib/types'

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
  const relative = path.relative(repoRoot, absoluteFile)
  if (relative.startsWith('..')) {
    return { commits: [], uncommitted: false, unavailable: 'failed' }
  }

  try {
    const stdout = await git(repoRoot, [
      'log',
      '--follow',
      `--max-count=${limit}`,
      `--format=%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%s${RECORD}`,
      '--',
      relative,
    ])

    const commits = stdout
      .split(RECORD)
      .map((record) => record.replace(/^\n/, '').trim())
      .filter((record) => record !== '')
      .map((record) => {
        const [sha = '', shortSha = '', author = '', date = '', subject = ''] = record.split(FIELD)
        return { sha, shortSha, author, date, subject }
      })

    return { commits, uncommitted: await hasUncommittedChanges(repoRoot, relative) }
  } catch (error) {
    // A path git has never seen, or a repo with no commits at all, exits non-zero. That is
    // "no history yet" — the normal state of a feature you just created — not a failure.
    if (isMissingHistory(error)) {
      return { commits: [], uncommitted: await hasUncommittedChanges(repoRoot, relative) }
    }
    return { commits: [], uncommitted: false, unavailable: classify(error) }
  }
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
 * True when any feature file has changes that are not committed yet.
 *
 * Scoped to `root`, the chocks directory, not the whole repo: an edit elsewhere in the
 * checkout has nothing to do with a badge that promises to be about features.
 */
export async function hasUncommittedFeatureChanges(
  repoRoot: string,
  root: string,
): Promise<boolean> {
  const relative = path.relative(repoRoot, root)
  if (relative.startsWith('..')) return false
  return hasUncommittedChanges(repoRoot, relative)
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
