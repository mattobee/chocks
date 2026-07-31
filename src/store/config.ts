import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  DEFAULT_STATUSES,
  isValidStatusId,
  STATUS_COLORS,
  type StatusColor,
  type StatusDefinition,
} from '../lib/status'
import type { ChocksConfig } from '../lib/types'

export const CONFIG_FILENAME = 'config.yaml'

export interface LoadedConfig {
  config: ChocksConfig
  /** Problems found in the file. Reported, not thrown — bad config falls back to defaults. */
  problems: string[]
}

/**
 * Reads `.chocks/config.yaml`.
 *
 * A missing file is the normal case and yields the defaults. A malformed one is reported
 * and then ignored: refusing to start because a colour name is misspelled would be a poor
 * trade when the whole tree is otherwise readable.
 */
export async function loadConfig(root: string): Promise<LoadedConfig> {
  let raw: string
  try {
    raw = await readFile(path.join(root, CONFIG_FILENAME), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { config: { statuses: DEFAULT_STATUSES }, problems: [] }
    }
    throw error
  }

  return parseConfig(raw)
}

/** Pure half of `loadConfig`, so the validation rules are testable without a filesystem. */
export function parseConfig(raw: string): LoadedConfig {
  const problems: string[] = []

  let data: unknown
  try {
    data = parseYaml(raw)
  } catch {
    return { config: { statuses: DEFAULT_STATUSES }, problems: ['config.yaml is not valid YAML'] }
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { config: { statuses: DEFAULT_STATUSES }, problems: ['config.yaml is not a mapping'] }
  }

  const statuses = parseStatuses((data as Record<string, unknown>).statuses, problems)
  return {
    config: { statuses: statuses ?? DEFAULT_STATUSES },
    problems,
  }
}

function parseStatuses(value: unknown, problems: string[]): StatusDefinition[] | null {
  if (value === undefined) return null
  if (!Array.isArray(value)) {
    problems.push('`statuses` must be a list')
    return null
  }

  const statuses: StatusDefinition[] = []
  const seen = new Set<string>()

  for (const [index, entry] of value.entries()) {
    const where = `statuses[${index}]`

    // `- idea` is allowed as shorthand for a status with a derived label.
    if (typeof entry === 'string') {
      addStatus(statuses, seen, problems, where, entry, undefined, undefined)
      continue
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where} must be a string or a mapping`)
      continue
    }

    const record = entry as Record<string, unknown>
    addStatus(
      statuses,
      seen,
      problems,
      where,
      record.id,
      record.label,
      record.color ?? record.colour,
    )
  }

  if (statuses.length === 0) {
    problems.push('`statuses` defined no usable entries')
    return null
  }
  return statuses
}

function addStatus(
  statuses: StatusDefinition[],
  seen: Set<string>,
  problems: string[],
  where: string,
  id: unknown,
  label: unknown,
  color: unknown,
): void {
  if (!isValidStatusId(id)) {
    problems.push(`${where}: id must be lowercase letters, digits and hyphens`)
    return
  }
  if (seen.has(id)) {
    problems.push(`${where}: duplicate id "${id}"`)
    return
  }
  seen.add(id)

  let resolved: StatusColor = 'slate'
  if (color !== undefined) {
    if (typeof color === 'string' && color in STATUS_COLORS && color !== 'unknown') {
      resolved = color as StatusColor
    } else {
      problems.push(`${where}: unknown colour "${String(color)}", using slate`)
    }
  }

  statuses.push({
    id,
    label: typeof label === 'string' && label.trim() !== '' ? label.trim() : humanise(id),
    color: resolved,
  })
}

function humanise(id: string): string {
  const spaced = id.replace(/-+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
