import {
  isMap,
  isScalar,
  parse as parseYaml,
  parseDocument,
  stringify as stringifyYaml,
} from 'yaml'
import { normaliseCode } from '../lib/code'
import { isValidUid } from '../lib/ids'
import { normaliseLinks } from '../lib/links'
import { isValidStatusId } from '../lib/status'
import type { Feature, FeatureCodeRef, FeatureLink, Importance } from '../lib/types'

/**
 * Pure conversions between a feature and the text of its markdown file.
 *
 * Kept free of `node:fs` so the format is testable on its own, and so the same code could
 * later run somewhere without a filesystem.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const FRONTMATTER_KEYS = [
  'title',
  'status',
  'importance',
  'tags',
  'links',
  'code',
  'sort',
  'uid',
] as const

export class FrontmatterError extends Error {
  constructor() {
    super('Frontmatter is malformed')
    this.name = 'FrontmatterError'
  }
}

export interface ParsedFile {
  uid: string
  title: string
  status: string
  importance?: Importance
  tags: string[]
  links: FeatureLink[]
  code: FeatureCodeRef[]
  sort: string
  description: string
}

/**
 * Reads one feature file.
 *
 * Deliberately lenient: a hand-written or half-merged file should still open in the UI
 * rather than break the whole tree, so unknown or malformed fields fall back to defaults
 * instead of throwing. `fallbackTitle` is used when the file has no title of its own.
 */
export function parseFeatureFile(content: string, fallbackTitle: string): ParsedFile {
  const match = FRONTMATTER.exec(content)
  const body = match ? content.slice(match[0].length) : content

  let data: Record<string, unknown> = {}
  if (match?.[1]) {
    try {
      const parsed: unknown = parseYaml(match[1])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>
      }
    } catch {
      // Malformed YAML: keep the body, fall back to defaults for the metadata.
    }
  }
  const importance = normaliseImportance(data.importance)

  return {
    // An invalid uid is treated as absent so it gets replaced rather than trusted.
    uid: isValidUid(data.uid) ? data.uid : '',
    title: typeof data.title === 'string' && data.title.trim() !== '' ? data.title : fallbackTitle,
    // Deliberately not checked against the configured list. A status from a branch with
    // different config, or a hand-typed one, must survive being read and written back.
    status: isValidStatusId(data.status) ? data.status : '',
    ...(importance !== undefined ? { importance } : {}),
    tags: normaliseTags(data.tags),
    links: normaliseLinks(data.links),
    code: normaliseCode(data.code),
    sort: typeof data.sort === 'string' && data.sort !== '' ? data.sort : '',
    description: body.replace(/^\r?\n/, '').trimEnd(),
  }
}

function normaliseImportance(value: unknown): Importance | undefined {
  if (typeof value !== 'string') return undefined
  const importance = value.trim().toLowerCase()
  return importance === 'high' || importance === 'normal' || importance === 'low'
    ? importance
    : undefined
}

function normaliseTags(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()]
  if (!Array.isArray(value)) return []
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
  return [...new Set(tags)]
}

/**
 * Writes one feature file.
 *
 * Key order is fixed rather than alphabetical so that editing a feature produces a minimal
 * diff — this content is reviewed in pull requests. `uid` goes last: it never changes, so
 * it stays out of the way of the fields people actually read.
 */
export function serializeFeatureFile(
  feature: Pick<
    Feature,
    'title' | 'status' | 'importance' | 'tags' | 'links' | 'code' | 'sort' | 'description' | 'uid'
  >,
  originalContent?: string,
): string {
  const frontmatter: Record<string, unknown> = {
    title: feature.title,
    status: feature.status,
  }
  if (feature.importance !== undefined) frontmatter.importance = feature.importance
  // Omit empty tags entirely; `tags: []` is noise in a diff.
  if (feature.tags.length > 0) frontmatter.tags = feature.tags
  // Same for links, and kept after tags so the header reads ...importance, tags, links.
  if (feature.links.length > 0) {
    frontmatter.links = feature.links.map(({ label, url, type }) => ({
      ...(label ? { label } : {}),
      url,
      ...(type ? { type } : {}),
    }))
  }
  // Same again for code, kept after links so the header reads ...tags, links, code, sort.
  if (feature.code.length > 0) {
    frontmatter.code = feature.code.map(({ path, kind }) => ({
      path,
      ...(kind ? { kind } : {}),
    }))
  }
  frontmatter.sort = feature.sort
  if (feature.uid !== '') frontmatter.uid = feature.uid

  const originalFrontmatter = originalContent ? FRONTMATTER.exec(originalContent)?.[1] : undefined
  let yaml: string
  if (originalFrontmatter !== undefined) {
    const document = parseDocument(originalFrontmatter)
    if (document.errors.length > 0) throw new FrontmatterError()
    if (!isMap(document.contents)) {
      throw new FrontmatterError()
    }

    for (const [key, value] of Object.entries(frontmatter)) {
      if (document.has(key)) {
        document.set(key, value)
        continue
      }

      const keyOrder = FRONTMATTER_KEYS.indexOf(key as (typeof FRONTMATTER_KEYS)[number])
      const index = document.contents.items.findIndex((pair) => {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') return false
        return (
          FRONTMATTER_KEYS.indexOf(pair.key.value as (typeof FRONTMATTER_KEYS)[number]) > keyOrder
        )
      })
      document.set(key, value)
      if (index !== -1) {
        const pair = document.contents.items.pop()!
        document.contents.items.splice(index, 0, pair)
      }
    }
    for (const key of ['importance', 'tags', 'links', 'code', 'uid']) {
      if (!(key in frontmatter)) document.delete(key)
    }
    yaml = document.toString({ lineWidth: 0 }).trimEnd()
  } else {
    yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()
  }
  const body = feature.description.trim()

  return body === '' ? `---\n${yaml}\n---\n` : `---\n${yaml}\n---\n\n${body}\n`
}
