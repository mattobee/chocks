import { randomBytes, randomInt } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFeatureFile, serializeFeatureFile } from './format'
import { FEATURE_SUFFIX, humanise, isValidId, joinId, parentOf, slugify, slugOf } from '../lib/ids'
import { generateNKeysBetween } from 'fractional-indexing'
import { childrenOf, isValidSortKey, sortKeyForIndex } from '../lib/tree'
import { defaultStatusId, DEFAULT_STATUSES, type StatusDefinition } from '../lib/status'
import type { Feature } from '../lib/types'

/**
 * Reads and writes the `.chocks` directory.
 *
 * The layout is `<slug>.feature.md` for a feature and a sibling `<slug>/` directory for its
 * children, so gaining children never moves the parent's own file. A feature's id is its
 * path without the extension, which makes the filesystem the single source of truth for
 * the hierarchy.
 */

/**
 * Ten hex characters, always starting with a letter.
 *
 * The leading letter is not cosmetic: an all-digit uid is a YAML number, so it would be
 * written quoted while others are bare, and a hand-typed unquoted one would parse as a
 * number and be silently discarded as invalid.
 */
export function generateUid(): string {
  const first = 'abcdef'[randomInt(6)]
  return `${first}${randomBytes(5).toString('hex').slice(1)}`
}

/** Thrown for anything the server should answer with a 4xx rather than a 500. */
export class StoreError extends Error {
  /** HTTP status the server should map this to. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'StoreError'
    this.status = status
  }
}

/** Resolves a feature id to its file path, refusing anything that escapes the root. */
function fileFor(root: string, id: string): string {
  if (!isValidId(id)) throw new StoreError(`Invalid feature id: ${id}`, 400)
  const file = path.join(root, `${id}${FEATURE_SUFFIX}`)
  assertInside(root, file)
  return file
}

/** Resolves a feature id to the directory holding its children. */
function dirFor(root: string, id: string): string {
  if (id === '') return root
  if (!isValidId(id)) throw new StoreError(`Invalid feature id: ${id}`, 400)
  const dir = path.join(root, id)
  assertInside(root, dir)
  return dir
}

/**
 * Belt and braces over `isValidId`: resolve the final path and confirm it is still under
 * the root. Catches anything the id validation might miss, including symlink-free
 * normalisation surprises on other platforms.
 */
function assertInside(root: string, target: string): void {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new StoreError('Path escapes the chocks directory', 400)
  }
}

/**
 * Reads every feature under the root.
 *
 * A directory with no matching `.md` file is not an error: its children are still read,
 * and `buildTree` surfaces them as roots rather than hiding them. That only happens when
 * files are hand-edited, and losing sight of them would be worse than an odd-looking tree.
 */
export async function scan(root: string): Promise<Feature[]> {
  const { features } = await scanWithIgnored(root)
  return features
}

/** As `scan`, but also reports markdown files skipped for lacking the feature suffix. */
export async function scanWithIgnored(
  root: string,
): Promise<{ features: Feature[]; ignored: string[] }> {
  const features: Feature[] = []
  const ignored: string[] = []

  async function walk(dir: string, parentId: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), joinId(parentId, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(FEATURE_SUFFIX)) {
        // Any other markdown here is someone's notes or a README, not a feature.
        if (entry.name.endsWith('.md')) ignored.push(path.join(dir, entry.name))
        continue
      }

      const slug = entry.name.slice(0, -FEATURE_SUFFIX.length)
      const id = joinId(parentId, slug)
      const content = await readFile(path.join(dir, entry.name), 'utf8')
      const parsed = parseFeatureFile(content, humanise(slug))
      features.push({
        id,
        uid: parsed.uid,
        parent: parentId,
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        tags: parsed.tags,
        // A file written by hand may have no sort key; fall back to the slug so ordering
        // is at least stable and alphabetical rather than random.
        sort: parsed.sort || `~${slug}`,
      })
    }
  }

  await walk(root, '')
  return { features, ignored }
}

/**
 * `desired`, or `desired-2`, `desired-3`… until nothing under the same parent claims it.
 *
 * Slugs are filenames, so two siblings with the same slug resolve to the same path and the
 * second write silently overwrites the first.
 */
function uniqueSlug(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(`${desired}-${suffix}`)) suffix++
  return `${desired}-${suffix}`
}

export interface CreateInput {
  parent: string
  title: string
  status?: string
  tags?: string[]
  description?: string
  /** Used only to pick the default status for a new feature. */
  statuses?: StatusDefinition[]
}

export async function create(root: string, input: CreateInput): Promise<Feature> {
  const title = input.title.trim()
  if (title === '') throw new StoreError('Title is required', 400)
  if (input.parent !== '' && !isValidId(input.parent)) {
    throw new StoreError(`Invalid parent id: ${input.parent}`, 400)
  }

  const existing = await scan(root)
  const siblings = childrenOf(existing, input.parent)
  const taken = new Set(siblings.map((feature) => slugOf(feature.id)))

  const feature: Feature = {
    id: joinId(input.parent, uniqueSlug(slugify(title), taken)),
    uid: generateUid(),
    parent: input.parent,
    title,
    description: input.description ?? '',
    status: input.status ?? defaultStatusId(input.statuses ?? DEFAULT_STATUSES),
    tags: input.tags ?? [],
    sort: sortKeyForIndex(siblings, siblings.length),
  }

  const file = fileFor(root, feature.id)
  await mkdir(path.dirname(file), { recursive: true })
  await writeAtomic(file, serializeFeatureFile(feature))
  return feature
}

export interface UpdateInput {
  title?: string
  status?: string
  tags?: string[]
  description?: string
  sort?: string
}

/**
 * Updates a feature's fields, renaming its file when the title changes.
 *
 * Keeping the filename in step with the title is what stops `.chocks` drifting out of
 * sync with what the UI shows. It does mean `id` can change here — callers must use the
 * returned feature rather than assuming the id they passed in still resolves. Links are
 * unaffected because they are keyed on `uid`, which never changes.
 */
export async function update(root: string, id: string, patch: UpdateInput): Promise<Feature> {
  const current = await read(root, id)

  const next: Feature = {
    ...current,
    // A uid is minted here if the file was written by hand without one.
    uid: current.uid || generateUid(),
    ...(patch.title !== undefined && patch.title.trim() !== ''
      ? { title: patch.title.trim() }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
  }

  if (next.title !== current.title) {
    const desired = slugify(next.title)
    if (desired !== slugOf(id)) {
      const all = await scan(root)
      const taken = new Set(
        childrenOf(all, current.parent)
          .filter((feature) => feature.id !== id)
          .map((feature) => slugOf(feature.id)),
      )
      next.id = joinId(current.parent, uniqueSlug(desired, taken))
      await relocate(root, id, next.id)
    }
  }

  await writeAtomic(fileFor(root, next.id), serializeFeatureFile(next))
  return next
}

/** Moves a feature's file and, if it has one, its children directory. */
async function relocate(root: string, fromId: string, toId: string): Promise<void> {
  const toFile = fileFor(root, toId)
  await mkdir(path.dirname(toFile), { recursive: true })
  await rename(fileFor(root, fromId), toFile)

  try {
    await rename(dirFor(root, fromId), dirFor(root, toId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Leaf feature: no children directory to move.
  }
}

export interface Backfilled {
  /** Features given a permanent uid. */
  uids: number
  /** Features given a real sort key in place of the scanned placeholder. */
  sortKeys: number
}

/**
 * Fills in what a hand-written or agent-written file leaves out.
 *
 * Runs at startup and whenever files change on disk, rather than during `scan`, so reads
 * stay free of side effects.
 *
 * A missing uid costs you a stable URL. A missing sort key is worse: `scan` stands in
 * `~<slug>`, which orders sensibly but is not a fractional index, so the first attempt to
 * reorder anything alongside it fails.
 */
export async function backfill(root: string): Promise<Backfilled> {
  const features = await scan(root)
  const sortKeys = plannedSortKeys(features)

  const counts: Backfilled = { uids: 0, sortKeys: 0 }
  for (const feature of features) {
    const uid = feature.uid || generateUid()
    const sort = sortKeys.get(feature.id) ?? feature.sort
    if (uid === feature.uid && sort === feature.sort) continue

    await writeAtomic(fileFor(root, feature.id), serializeFeatureFile({ ...feature, uid, sort }))
    if (uid !== feature.uid) counts.uids++
    if (sort !== feature.sort) counts.sortKeys++
  }
  return counts
}

/**
 * Real sort keys for the features whose own key is unusable, keyed by id.
 *
 * Records the order the tree already displays in rather than imposing a new one. Siblings
 * with a usable key keep it, so their files stay out of the diff, and each run of unusable
 * ones is generated into the gap between the usable keys either side of it.
 *
 * Walking runs rather than treating the unusable ones as a single tail matters because
 * `~<slug>` is not the only key that can fail. A hand-edited `sort: 9bad` is unusable too,
 * and sorts *before* a real key rather than after it, so appending would silently move it
 * down the list.
 */
function plannedSortKeys(features: Feature[]): Map<string, string> {
  const planned = new Map<string, string>()

  for (const parent of new Set(features.map((feature) => feature.parent))) {
    const siblings = childrenOf(features, parent)

    let index = 0
    while (index < siblings.length) {
      if (isValidSortKey(siblings[index]!.sort)) {
        index++
        continue
      }

      let end = index
      while (end < siblings.length && !isValidSortKey(siblings[end]!.sort)) end++

      // Everything before `index` and from `end` on is usable, so these bound the gap.
      const previous = index > 0 ? siblings[index - 1]!.sort : null
      const following = end < siblings.length ? siblings[end]!.sort : null
      const keys = generateNKeysBetween(previous, following, end - index)
      keys.forEach((key, offset) => planned.set(siblings[index + offset]!.id, key))

      index = end
    }
  }

  return planned
}

export async function read(root: string, id: string): Promise<Feature> {
  const file = fileFor(root, id)
  let content: string
  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new StoreError(`No such feature: ${id}`, 404)
    }
    throw error
  }
  const slug = slugOf(id)
  const parsed = parseFeatureFile(content, humanise(slug))
  return {
    id,
    uid: parsed.uid,
    parent: parentOf(id),
    title: parsed.title,
    description: parsed.description,
    status: parsed.status,
    tags: parsed.tags,
    sort: parsed.sort || `~${slug}`,
  }
}

/** Deletes a feature and, with it, its entire subtree. */
export async function remove(root: string, id: string): Promise<void> {
  const file = fileFor(root, id)
  const dir = dirFor(root, id)
  await rm(file, { force: true })
  await rm(dir, { recursive: true, force: true })
}

export interface MoveInput {
  newParent: string
  /** Position among the destination's children, excluding the feature being moved. */
  index: number
}

/**
 * Reparents and/or reorders a feature, moving its file and its children's directory.
 *
 * Every descendant's id changes, since ids are paths — callers must re-read rather than
 * patch their cache.
 */
export async function move(root: string, id: string, input: MoveInput): Promise<Feature> {
  const { newParent, index } = input
  if (newParent !== '' && !isValidId(newParent)) {
    throw new StoreError(`Invalid parent id: ${newParent}`, 400)
  }
  if (newParent === id || newParent.startsWith(`${id}/`)) {
    throw new StoreError('A feature cannot be moved inside itself', 400)
  }

  // Reading first so an unknown or malformed id fails cleanly, before anything is renamed.
  await read(root, id)
  const all = await scan(root)

  const destinationSiblings = childrenOf(all, newParent).filter((feature) => feature.id !== id)
  const taken = new Set(destinationSiblings.map((feature) => slugOf(feature.id)))

  const newId = joinId(newParent, uniqueSlug(slugOf(id), taken))
  const sort = sortKeyForIndex(destinationSiblings, index)

  // Children live in a sibling directory, which has to follow the file.
  if (newId !== id) await relocate(root, id, newId)

  // Only the sort key changes: with no title in the patch, update() leaves the file where
  // relocate just put it.
  return update(root, newId, { sort })
}

/**
 * Writes via a temporary file and a rename.
 *
 * The watcher and the user's editor may both be looking at this file; a partial write
 * would surface as a corrupt feature.
 */
async function writeAtomic(file: string, content: string): Promise<void> {
  const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, content, 'utf8')
  try {
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
