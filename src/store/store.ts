import { randomBytes, randomInt } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFeatureFile, serializeFeatureFile } from './format'
import { FEATURE_SUFFIX, humanise, isValidId, joinId, parentOf, slugify, slugOf } from '../lib/ids'
import { siblingsOf, sortKeyForIndex } from '../lib/tree'
import { defaultStatusId, DEFAULT_STATUSES, type StatusDefinition } from '../lib/status'
import type { Feature } from '../lib/types'

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

/**
 * Reads and writes the `.chocks` directory.
 *
 * The layout is `<slug>.md` for a feature and a sibling `<slug>/` directory for its
 * children, so gaining children never moves the parent's own file. A feature's id is its
 * path without the extension, which makes the filesystem the single source of truth for
 * the hierarchy.
 */

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
  const siblings = siblingsOf(existing, input.parent)
  const taken = new Set(siblings.map((feature) => slugOf(feature.id)))

  let slug = slugify(title)
  if (taken.has(slug)) {
    let suffix = 2
    while (taken.has(`${slug}-${suffix}`)) suffix++
    slug = `${slug}-${suffix}`
  }

  const feature: Feature = {
    id: joinId(input.parent, slug),
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
        siblingsOf(all, current.parent)
          .filter((feature) => feature.id !== id)
          .map((feature) => slugOf(feature.id)),
      )
      let slug = desired
      if (taken.has(slug)) {
        let suffix = 2
        while (taken.has(`${slug}-${suffix}`)) suffix++
        slug = `${slug}-${suffix}`
      }
      next.id = joinId(current.parent, slug)
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

/**
 * Gives every feature that lacks a uid a permanent one.
 *
 * Runs once at startup rather than during `scan`, so reads stay free of side effects.
 * Files created by hand, or predating uids, are backfilled with a one-line change.
 */
export async function ensureUids(root: string): Promise<number> {
  const features = await scan(root)
  let written = 0
  for (const feature of features) {
    if (feature.uid !== '') continue
    await writeAtomic(
      fileFor(root, feature.id),
      serializeFeatureFile({ ...feature, uid: generateUid() }),
    )
    written++
  }
  return written
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

  const current = await read(root, id)
  const all = await scan(root)
  const slug = slugOf(id)

  const destinationSiblings = siblingsOf(all, newParent).filter((feature) => feature.id !== id)
  const taken = new Set(destinationSiblings.map((feature) => slugOf(feature.id)))
  let targetSlug = slug
  if (taken.has(targetSlug)) {
    let suffix = 2
    while (taken.has(`${targetSlug}-${suffix}`)) suffix++
    targetSlug = `${targetSlug}-${suffix}`
  }

  const newId = joinId(newParent, targetSlug)
  const sort = sortKeyForIndex(destinationSiblings, index)

  // Children live in a sibling directory, which has to follow the file.
  if (newId !== id) await relocate(root, id, newId)

  // The title is passed through unchanged, so update() will not re-slug the file here.
  return update(root, newId, { ...current, sort })
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
