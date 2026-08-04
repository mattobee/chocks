import { randomBytes, randomInt } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { parseFeatureFile, serializeFeatureFile } from './format'
import { FEATURE_SUFFIX, humanise, isValidId, joinId, parentOf, slugify, slugOf } from '../lib/ids'
import { generateNKeysBetween } from 'fractional-indexing'
import { childrenOf, isValidSortKey, sortKeyForIndex } from '../lib/tree'
import { describeError } from '../lib/errors'
import { defaultStatusId, DEFAULT_STATUSES, type StatusDefinition } from '../lib/status'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TAG_COUNT,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  type Feature,
} from '../lib/types'

/**
 * Reads and writes the `.chocks` directory.
 *
 * Leaves are `<slug>.chocks.md`. A feature with children is `<slug>/index.chocks.md`, with
 * its children beside that index. A feature's id is the leaf path without its extension or
 * the parent directory path, making the filesystem the source of truth for hierarchy.
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

const mutationQueues = new Map<string, Promise<void>>()

function validateInput(title?: string, tags?: string[], description?: string): void {
  if (title !== undefined) {
    if (title.length > MAX_TITLE_LENGTH) {
      throw new StoreError(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400)
    }
  }
  if (tags !== undefined) {
    if (tags.length > MAX_TAG_COUNT) {
      throw new StoreError(`Tags exceed maximum count of ${MAX_TAG_COUNT}`, 400)
    }
    for (const tag of tags) {
      if (tag.length > MAX_TAG_LENGTH) {
        throw new StoreError(`Tag exceeds maximum length of ${MAX_TAG_LENGTH} characters`, 400)
      }
    }
  }
  if (description !== undefined) {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new StoreError(
        `Description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`,
        400,
      )
    }
  }
}

export async function runStoreMutation<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(root)
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const turn = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => turn)
  mutationQueues.set(key, tail)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key)
  }
}

/** Resolves a leaf feature id to its file path. */
function leafFileFor(root: string, id: string): string {
  if (!isValidId(id)) throw new StoreError(`Invalid feature id: ${id}`, 400)
  const file = path.join(root, `${id}${FEATURE_SUFFIX}`)
  assertInside(root, file)
  return file
}

/** Resolves a parent feature id to its index file. */
function indexFileFor(root: string, id: string): string {
  if (!isValidId(id)) throw new StoreError(`Invalid feature id: ${id}`, 400)
  const file = path.join(root, id, `index${FEATURE_SUFFIX}`)
  assertInside(root, file)
  return file
}

/**
 * Resolves a feature id to its current leaf or index file.
 *
 * Both forms are checked for symlinks here rather than left to the caller, because callers
 * outside this module use the returned path directly. `readSnapshot` re-checks the file it
 * is about to open, which is cheap and keeps that guarantee local to the read.
 */
export async function featureFileFor(root: string, id: string): Promise<string> {
  const directory = dirFor(root, id)
  await assertNoSymlinks(root, directory)
  try {
    if ((await lstat(directory)).isDirectory()) return indexFileFor(root, id)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const leaf = leafFileFor(root, id)
  await assertNoSymlinks(root, leaf)
  return leaf
}

/** Resolves a feature id to its directory form. */
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

async function assertNoSymlinks(root: string, target: string): Promise<void> {
  assertInside(root, target)
  const resolvedRoot = path.resolve(root)
  const relative = path.relative(resolvedRoot, path.resolve(target))
  let current = resolvedRoot

  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new StoreError('Symbolic links are not allowed inside the chocks directory', 400)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

/** Reads every feature under the root. */
export async function scan(root: string): Promise<Feature[]> {
  const { features } = await scanWithIgnored(root)
  return features
}

/** As `scan`, but also reports markdown files skipped for lacking the feature suffix. */
export async function scanWithIgnored(
  root: string,
): Promise<{ features: Feature[]; ignored: string[] }> {
  await assertNoSymlinks(root, root)
  const features: Feature[] = []
  const ignored: string[] = []

  async function addFeature(filePath: string, id: string, parent: string): Promise<void> {
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    const slug = slugOf(id)
    const parsed = parseFeatureFile(content, humanise(slug))
    features.push({
      id,
      uid: parsed.uid,
      parent,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      tags: parsed.tags,
      sort: parsed.sort || `~${slug}`,
    })
  }

  async function walk(dir: string, parentId: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    if (
      parentId === '' &&
      entries.some((entry) => entry.isFile() && entry.name === `index${FEATURE_SUFFIX}`)
    ) {
      throw new StoreError(
        `Invalid feature index at ${path.join(root, `index${FEATURE_SUFFIX}`)}: remove the root index.chocks.md`,
        400,
      )
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const id = joinId(parentId, entry.name)
        const leafName = `${entry.name}${FEATURE_SUFFIX}`
        if (entries.some((candidate) => candidate.isFile() && candidate.name === leafName)) {
          throw new StoreError(
            `Invalid feature ${id}: remove either ${leafName} or the ${entry.name}/ directory`,
            400,
          )
        }
        const indexFile = path.join(entryPath, `index${FEATURE_SUFFIX}`)
        let hasIndex = false
        try {
          hasIndex = (await lstat(indexFile)).isFile()
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (!hasIndex) {
          throw new StoreError(
            `Invalid feature directory ${entryPath}: add index.chocks.md or remove the directory`,
            400,
          )
        }
        await addFeature(indexFile, id, parentId)
        await walk(entryPath, id)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(FEATURE_SUFFIX)) {
        if (entry.name.endsWith('.md')) ignored.push(entryPath)
        continue
      }
      if (entry.name === `index${FEATURE_SUFFIX}`) continue

      const slug = entry.name.slice(0, -FEATURE_SUFFIX.length)
      await addFeature(entryPath, joinId(parentId, slug), parentId)
    }
  }

  await walk(root, '')
  return { features, ignored }
}

/**
 * `desired`, or `desired-2`, `desired-3`… until nothing under the same parent claims it.
 *
 * Slugs are filenames, so two siblings with the same slug would claim the same path.
 */
function uniqueSlug(desired: string, taken: ReadonlySet<string>): string {
  if (desired !== 'index' && !taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(`${desired}-${suffix}`)) suffix++
  return `${desired}-${suffix}`
}

async function promote(root: string, id: string): Promise<void> {
  const directory = dirFor(root, id)
  await assertNoSymlinks(root, directory)
  try {
    if ((await lstat(directory)).isDirectory()) return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const leaf = leafFileFor(root, id)
  await assertNoSymlinks(root, leaf)
  await mkdir(directory)
  try {
    await rename(leaf, indexFileFor(root, id))
  } catch (error) {
    try {
      await rmdir(directory)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Feature promotion failed and the new directory is no longer empty',
      )
    }
    throw error
  }
}

export interface CreateInput {
  parent: string
  title: string
  status?: string
  tags?: string[]
  description?: string
  /** Used only to pick the default status for a new feature. */
  statuses?: StatusDefinition[]
  /**
   * Identity to restore rather than mint.
   *
   * Undoing a delete has to put the feature back as itself: the uid, because that is what
   * every link resolves on; the sort key, because position alone would not reproduce it;
   * and the slug, because a hand-written file's name need not match its title, and undo
   * quietly renaming someone's file is not undo. Left out for an ordinary create, which
   * gets a fresh uid, a name from its title and a place at the end.
   */
  uid?: string
  sort?: string
  slug?: string
}

export function create(root: string, input: CreateInput): Promise<Feature> {
  return runStoreMutation(root, () => createUnlocked(root, input))
}

async function createUnlocked(root: string, input: CreateInput): Promise<Feature> {
  const title = input.title.trim()
  if (title === '') throw new StoreError('Title is required', 400)
  validateInput(title, input.tags, input.description)
  if (input.sort !== undefined && !isValidSortKey(input.sort)) {
    throw new StoreError('Invalid sort key', 400)
  }
  if (input.parent !== '' && !isValidId(input.parent)) {
    throw new StoreError(`Invalid parent id: ${input.parent}`, 400)
  }

  if (input.parent !== '') await assertNoSymlinks(root, dirFor(root, input.parent))
  const existing = await scan(root)
  if (input.parent !== '') {
    const parentExists = existing.some((feature) => feature.id === input.parent)
    if (!parentExists) {
      throw new StoreError(`Parent feature does not exist: ${input.parent}`, 400)
    }
  }
  if (input.uid !== undefined && existing.some((feature) => feature.uid === input.uid)) {
    // Two features answering to one uid would make `findByKey` pick between them
    // arbitrarily, so every link to either becomes a coin toss.
    throw new StoreError(`A feature already has the uid ${input.uid}`, 409)
  }

  const siblings = childrenOf(existing, input.parent)
  const taken = new Set(siblings.map((feature) => slugOf(feature.id)))

  const desiredSlug = input.slug ?? slugify(title)
  if (!isValidId(desiredSlug) || desiredSlug.includes('/')) {
    throw new StoreError(`Invalid slug: ${desiredSlug}`, 400)
  }

  const feature: Feature = {
    id: joinId(input.parent, uniqueSlug(desiredSlug, taken)),
    uid: input.uid ?? generateUid(),
    parent: input.parent,
    title,
    description: input.description ?? '',
    status: input.status ?? defaultStatusId(input.statuses ?? DEFAULT_STATUSES),
    tags: input.tags ?? [],
    sort: input.sort ?? sortKeyForIndex(siblings, siblings.length),
  }

  if (input.parent !== '') await promote(root, input.parent)
  const file = leafFileFor(root, feature.id)
  const directory = path.dirname(file)
  await assertNoSymlinks(root, directory)
  await mkdir(directory, { recursive: true })
  await assertNoSymlinks(root, directory)
  await writeAtomic(file, serializeFeatureFile(feature), null)
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
export function update(root: string, id: string, patch: UpdateInput): Promise<Feature> {
  return runStoreMutation(root, () => updateUnlocked(root, id, patch))
}

async function updateUnlocked(root: string, id: string, patch: UpdateInput): Promise<Feature> {
  validateInput(patch.title, patch.tags, patch.description)
  if (patch.sort !== undefined && !isValidSortKey(patch.sort)) {
    throw new StoreError('Invalid sort key', 400)
  }
  const { feature: current, content } = await readSnapshot(root, id)

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
      if (next.id !== id) await relocate(root, id, next.id, content)
    }
  }

  await writeAtomic(await featureFileFor(root, next.id), serializeFeatureFile(next), content)
  return next
}

/** Moves a leaf file or a parent directory as one filesystem entry. */
async function relocate(
  root: string,
  fromId: string,
  toId: string,
  expectedContent: string,
): Promise<void> {
  const fromFile = await featureFileFor(root, fromId)
  const fromDirectory = dirFor(root, fromId)
  const isParent = fromFile === indexFileFor(root, fromId)
  const fromEntry = isParent ? fromDirectory : fromFile
  const toEntry = isParent ? dirFor(root, toId) : leafFileFor(root, toId)
  const toDirectory = path.dirname(toEntry)
  await assertNoSymlinks(root, fromEntry)
  await assertNoSymlinks(root, toDirectory)
  await mkdir(toDirectory, { recursive: true })
  await assertNoSymlinks(root, toDirectory)
  await assertUnchanged(fromFile, expectedContent)

  if (isParent) {
    await assertAbsent(toEntry)
    try {
      await rename(fromEntry, toEntry)
    } catch (error) {
      // A directory that appeared since `assertAbsent` reports ENOTEMPTY rather than
      // EEXIST, and that is the shape a raced destination actually takes: a valid one
      // holds an index file.
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        throw new StoreError('Feature changed on disk; reload and try again', 409)
      }
      throw error
    }
    return
  }

  try {
    await link(fromFile, toEntry)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new StoreError('Feature changed on disk; reload and try again', 409)
    }
    throw error
  }
  try {
    await rm(fromFile)
  } catch (error) {
    try {
      await rm(toEntry, { force: true })
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Feature relocation failed and could not be rolled back',
      )
    }
    throw error
  }
}

export interface Backfilled {
  /** Features given a permanent uid. */
  uids: number
  /** Features given a real sort key in place of the scanned placeholder. */
  sortKeys: number
  /** Files that could not be written, each as `<id>: <reason>`. */
  failures: string[]
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
 *
 * A file that cannot be written is collected rather than thrown. Backfilling is a
 * convenience, and one read-only file is no reason to abandon the rest of the tree or to
 * stop chocks starting.
 */
export function backfill(root: string): Promise<Backfilled> {
  return runStoreMutation(root, () => backfillUnlocked(root))
}

async function backfillUnlocked(root: string): Promise<Backfilled> {
  const features = await scan(root)
  const sortKeys = plannedSortKeys(features)

  const counts: Backfilled = { uids: 0, sortKeys: 0, failures: [] }
  for (const scanned of features) {
    try {
      const { feature, content } = await readSnapshot(root, scanned.id)
      const uid = feature.uid || generateUid()
      const sort =
        feature.sort === scanned.sort ? (sortKeys.get(feature.id) ?? feature.sort) : feature.sort
      if (uid === feature.uid && sort === feature.sort) continue

      await writeAtomic(
        await featureFileFor(root, feature.id),
        serializeFeatureFile({ ...feature, uid, sort }),
        content,
      )
      if (uid !== feature.uid) counts.uids++
      if (sort !== feature.sort) counts.sortKeys++
    } catch (error) {
      counts.failures.push(`${scanned.id}: ${describeError(error)}`)
    }
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
  return (await readSnapshot(root, id)).feature
}

async function readSnapshot(
  root: string,
  id: string,
): Promise<{ feature: Feature; content: string }> {
  const file = await featureFileFor(root, id)
  await assertNoSymlinks(root, file)
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
    content,
    feature: {
      id,
      uid: parsed.uid,
      parent: parentOf(id),
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      tags: parsed.tags,
      sort: parsed.sort || `~${slug}`,
    },
  }
}

/** Deletes a feature and, with it, its entire subtree. */
export function remove(root: string, id: string): Promise<void> {
  return runStoreMutation(root, () => removeUnlocked(root, id))
}

async function removeUnlocked(root: string, id: string): Promise<void> {
  const file = await featureFileFor(root, id)
  const entry = file === indexFileFor(root, id) ? dirFor(root, id) : file
  await assertNoSymlinks(root, entry)
  await rm(entry, { recursive: true, force: true })
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
export function move(root: string, id: string, input: MoveInput): Promise<Feature> {
  return runStoreMutation(root, () => moveUnlocked(root, id, input))
}

async function moveUnlocked(root: string, id: string, input: MoveInput): Promise<Feature> {
  const { newParent, index } = input
  if (!Number.isInteger(index) || index < 0) {
    throw new StoreError('Invalid move index', 400)
  }
  if (newParent !== '' && !isValidId(newParent)) {
    throw new StoreError(`Invalid parent id: ${newParent}`, 400)
  }
  if (newParent === id || newParent.startsWith(`${id}/`)) {
    throw new StoreError('A feature cannot be moved inside itself', 400)
  }

  // Reading first so an unknown or malformed id fails cleanly, before anything is renamed.
  const { content } = await readSnapshot(root, id)
  const all = await scan(root)

  if (newParent !== '') {
    const parentExists = all.some((feature) => feature.id === newParent)
    if (!parentExists) {
      throw new StoreError(`Parent feature does not exist: ${newParent}`, 400)
    }
  }

  const destinationSiblings = childrenOf(all, newParent).filter((feature) => feature.id !== id)
  const taken = new Set(destinationSiblings.map((feature) => slugOf(feature.id)))

  const newId = joinId(newParent, uniqueSlug(slugOf(id), taken))
  const sort = sortKeyForIndex(destinationSiblings, index)

  if (newParent !== '') await promote(root, newParent)
  if (newId !== id) await relocate(root, id, newId, content)

  // Only the sort key changes: with no title in the patch, update() leaves the file where
  // relocate just put it.
  return updateUnlocked(root, newId, { sort })
}

async function assertAbsent(target: string): Promise<void> {
  try {
    await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  throw new StoreError('Feature changed on disk; reload and try again', 409)
}

async function assertUnchanged(file: string, expectedContent: string): Promise<void> {
  let current: string
  try {
    current = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new StoreError('Feature changed on disk; reload and try again', 409)
    }
    throw error
  }
  if (current !== expectedContent) {
    throw new StoreError('Feature changed on disk; reload and try again', 409)
  }
}

/**
 * Writes through a temporary file before publishing atomically.
 *
 * The watcher and the user's editor may both be looking at this file; a partial write
 * would surface as a corrupt feature.
 */
async function writeAtomic(
  file: string,
  content: string,
  expectedContent?: string | null,
): Promise<void> {
  const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, content, 'utf8')
  try {
    if (expectedContent === null) {
      await link(temporary, file)
      await rm(temporary, { force: true })
      return
    }
    if (expectedContent !== undefined) await assertUnchanged(file, expectedContent)
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    if (expectedContent === null && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new StoreError('Feature changed on disk; reload and try again', 409)
    }
    throw error
  }
}
