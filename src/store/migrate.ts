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

async function canUseGit(repoRoot: string, root: string): Promise<boolean> {
  const relative = path.relative(repoRoot, root)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  try {
    await run('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'])
    const { stdout } = await run('git', ['-C', repoRoot, 'status', '--porcelain'])
    return stdout.trim() === ''
  } catch {
    return false
  }
}

export async function migrateLayout(root: string, repoRoot: string): Promise<MigrationResult> {
  const moves: Array<{ from: string; to: string }> = []

  async function walk(directory: string): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) await walk(path.join(directory, entry.name))
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
      const to = hasSiblingDirectory
        ? path.join(sibling, `index${FEATURE_SUFFIX}`)
        : suffix === LEGACY_SUFFIX
          ? path.join(directory, `${slug}${FEATURE_SUFFIX}`)
          : null
      if (to) moves.push({ from, to })
    }
  }

  await walk(root)
  if (moves.length === 0) return { moved: 0, usedGit: false }

  for (const move of moves) {
    try {
      await lstat(move.to)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    throw new Error(`Cannot migrate ${move.from}: destination already exists at ${move.to}`)
  }

  const usedGit = await canUseGit(repoRoot, root)
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
