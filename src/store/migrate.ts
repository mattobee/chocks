import { execFile } from 'node:child_process'
import { lstat, mkdir, readdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { FEATURE_SUFFIX } from '../lib/ids'

const run = promisify(execFile)
const LEGACY_SUFFIX = '.feature.md'

export interface MigrationResult {
  moved: number
  usedGit: boolean
}

async function canUseGit(repoRoot: string, root: string, sources: string[]): Promise<boolean> {
  const relative = path.relative(repoRoot, root)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  try {
    await run('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'])
    const { stdout } = await run('git', ['-C', repoRoot, 'status', '--porcelain'])
    if (stdout.trim() !== '') return false
    await run('git', [
      '-C',
      repoRoot,
      'ls-files',
      '--error-unmatch',
      '--',
      ...sources.map((source) => path.relative(repoRoot, source)),
    ])
    return true
  } catch {
    return false
  }
}

export async function migrateLayout(root: string, repoRoot: string): Promise<MigrationResult> {
  const moves: Array<{ from: string; to: string }> = []

  async function uniqueIndexLeaf(directory: string): Promise<string> {
    let suffix = 2
    for (;;) {
      const candidate = path.join(directory, `index-${suffix}${FEATURE_SUFFIX}`)
      try {
        await lstat(candidate)
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          !moves.some((move) => move.to === candidate)
        ) {
          return candidate
        }
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      suffix++
    }
  }

  async function walk(directory: string, oldLayoutDirectory = false): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    const oldParentSlugs = new Set(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            (entry.name.endsWith(FEATURE_SUFFIX) || entry.name.endsWith(LEGACY_SUFFIX)),
        )
        .map((entry) =>
          entry.name.slice(
            0,
            -(entry.name.endsWith(FEATURE_SUFFIX) ? FEATURE_SUFFIX.length : LEGACY_SUFFIX.length),
          ),
        ),
    )

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), oldParentSlugs.has(entry.name))
      }
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const suffix = entry.name.endsWith(FEATURE_SUFFIX)
        ? FEATURE_SUFFIX
        : entry.name.endsWith(LEGACY_SUFFIX)
          ? LEGACY_SUFFIX
          : null
      if (!suffix) continue

      const from = path.join(directory, entry.name)
      const slug = entry.name.slice(0, -suffix.length)
      const sibling = path.join(directory, slug)
      let hasSiblingDirectory = false
      try {
        hasSiblingDirectory = (await lstat(sibling)).isDirectory()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const reservedIndex = slug === 'index' && (directory === root || oldLayoutDirectory)
      const to = hasSiblingDirectory
        ? path.join(sibling, `index${FEATURE_SUFFIX}`)
        : reservedIndex
          ? await uniqueIndexLeaf(directory)
          : suffix === LEGACY_SUFFIX
            ? path.join(directory, `${slug}${FEATURE_SUFFIX}`)
            : null
      if (to) moves.push({ from, to })
    }
  }

  await walk(root)
  if (moves.length === 0) return { moved: 0, usedGit: false }

  const destinations = new Set<string>()
  for (const move of moves) {
    if (destinations.has(move.to)) {
      throw new Error(`Cannot migrate ${move.from}: more than one feature maps to ${move.to}`)
    }
    destinations.add(move.to)
  }

  const sources = new Set(moves.map((move) => move.from))
  for (const move of moves) {
    try {
      await lstat(move.to)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!sources.has(move.to)) {
      throw new Error(`Cannot migrate ${move.from}: destination already exists at ${move.to}`)
    }
  }

  const usedGit = await canUseGit(
    repoRoot,
    root,
    moves.map((move) => move.from),
  )
  for (const move of moves) {
    await mkdir(path.dirname(move.to), { recursive: true })
    if (usedGit) {
      await run('git', [
        '-C',
        repoRoot,
        'mv',
        path.relative(repoRoot, move.from),
        path.relative(repoRoot, move.to),
      ])
    } else {
      await rename(move.from, move.to)
    }
  }
  return { moved: moves.length, usedGit }
}
