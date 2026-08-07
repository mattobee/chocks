import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { CodeMatch, FeatureCodeRef } from '../lib/types'

/**
 * Counts how many files in the repo match each `code` entry's glob.
 *
 * Walked fresh per request, on its own endpoint rather than folded into the feature scan,
 * so opening the tree stays as fast as it always was: this only runs when a feature page
 * with `code` entries is open. A `flag` entry has no path to check, so its count is left
 * null rather than reported as zero, which would read as a broken claim it never made.
 */
export async function matchCodeRefs(
  repoRoot: string,
  code: FeatureCodeRef[],
): Promise<CodeMatch[]> {
  const needsWalk = code.some((ref) => ref.kind !== 'flag' && isGlob(ref.path))
  const entries = needsWalk ? await listEntries(repoRoot) : null

  return Promise.all(
    code.map(async (ref) => {
      if (ref.kind === 'flag') return { path: ref.path, count: null }
      if (!isGlob(ref.path)) {
        return { path: ref.path, count: (await exists(repoRoot, ref.path)) ? 1 : 0 }
      }
      const regex = globToRegExp(ref.path)
      return { path: ref.path, count: entries!.filter((entry) => regex.test(entry)).length }
    }),
  )
}

const GLOB_CHARS = /[*?]/

function isGlob(pattern: string): boolean {
  return GLOB_CHARS.test(pattern)
}

/**
 * A literal `code` path is hand-written frontmatter, not something already validated like
 * a store id, so it's resolved and checked against `repoRoot` before it's stat'd rather
 * than trusted the way `assertInside` trusts an already-validated feature path elsewhere.
 */
async function exists(repoRoot: string, relative: string): Promise<boolean> {
  const resolvedRoot = path.resolve(repoRoot)
  const resolved = path.resolve(resolvedRoot, relative)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return false
  try {
    await lstat(resolved)
    return true
  } catch {
    return false
  }
}

const SKIPPED_DIRS = new Set(['.git', 'node_modules'])

/**
 * Every file under `repoRoot`, as forward-slash paths relative to it.
 *
 * Directories themselves aren't counted: the count is "how many files", so a directory
 * caught by a glob would otherwise be tallied alongside the files inside it, doubling up
 * on the same claim. Symlinks are skipped rather than followed: one pointing at an
 * ancestor would recurse forever, and one pointing outside `repoRoot` has no business
 * being counted as a match for a path that's supposed to be repo-relative.
 */
async function listEntries(repoRoot: string): Promise<string[]> {
  const found: string[] = []

  async function walk(dir: string, relative: string): Promise<void> {
    let children
    try {
      children = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const child of children) {
      if (child.isSymbolicLink() || SKIPPED_DIRS.has(child.name)) continue
      const childRelative = relative === '' ? child.name : `${relative}/${child.name}`
      if (child.isDirectory()) {
        await walk(path.join(dir, child.name), childRelative)
      } else {
        found.push(childRelative)
      }
    }
  }

  await walk(repoRoot, '')
  return found
}

/**
 * Converts a glob to a regex matching a forward-slash relative path.
 *
 * `*` stays within one path segment, `**` crosses any number of them (including zero, so
 * `a/**\/b` also matches `a/b`), and `?` is one character. Everything else is escaped and
 * matched literally.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const source = escaped
    .replaceAll('**/', '\0DOUBLE_STAR_SLASH\0')
    .replaceAll('**', '\0DOUBLE_STAR\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replaceAll('\0DOUBLE_STAR_SLASH\0', '(?:[^/]+/)*')
    .replaceAll('\0DOUBLE_STAR\0', '.*')
  return new RegExp(`^${source}$`)
}
