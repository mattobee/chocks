import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { isValidUid } from '../lib/ids'
import { isFeatureStatus, type Feature, type FeatureStatus } from '../lib/types'

/**
 * Pure conversions between a feature and the text of its markdown file.
 *
 * Kept free of `node:fs` so the format is testable on its own, and so the same code could
 * later run somewhere without a filesystem.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface ParsedFile {
  uid: string
  title: string
  status: FeatureStatus
  tags: string[]
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

  return {
    // An invalid uid is treated as absent so it gets replaced rather than trusted.
    uid: isValidUid(data.uid) ? data.uid : '',
    title: typeof data.title === 'string' && data.title.trim() !== '' ? data.title : fallbackTitle,
    status: isFeatureStatus(data.status) ? data.status : 'planned',
    tags: normaliseTags(data.tags),
    sort: typeof data.sort === 'string' && data.sort !== '' ? data.sort : '',
    description: body.replace(/^\r?\n/, '').trimEnd(),
  }
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
  feature: Pick<Feature, 'title' | 'status' | 'tags' | 'sort' | 'description' | 'uid'>,
): string {
  const frontmatter: Record<string, unknown> = {
    title: feature.title,
    status: feature.status,
  }
  // Omit empty tags entirely; `tags: []` is noise in a diff.
  if (feature.tags.length > 0) frontmatter.tags = feature.tags
  frontmatter.sort = feature.sort
  if (feature.uid !== '') frontmatter.uid = feature.uid

  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()
  const body = feature.description.trim()

  return body === '' ? `---\n${yaml}\n---\n` : `---\n${yaml}\n---\n\n${body}\n`
}
