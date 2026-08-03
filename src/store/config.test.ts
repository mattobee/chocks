import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG_FILENAME, loadConfig, parseConfig } from './config'
import { DEFAULT_STATUSES } from '../lib/status'

describe('parseConfig', () => {
  it('falls back to the defaults for an empty file', () => {
    expect(parseConfig('').config.statuses).toEqual(DEFAULT_STATUSES)
  })

  it('reads a full status list', () => {
    const { config, problems } = parseConfig(`
statuses:
  - id: planned
    label: Planned
    color: blue
  - id: shipped
    label: Shipped
    color: emerald
`)
    expect(problems).toEqual([])
    expect(config.statuses).toEqual([
      { id: 'planned', label: 'Planned', color: 'blue' },
      { id: 'shipped', label: 'Shipped', color: 'emerald' },
    ])
  })

  it('accepts a bare string as shorthand and derives the label', () => {
    const { config } = parseConfig('statuses:\n  - planned\n  - in-review\n')
    expect(config.statuses).toEqual([
      { id: 'planned', label: 'Planned', color: 'slate' },
      { id: 'in-review', label: 'In review', color: 'slate' },
    ])
  })

  it('accepts the British spelling of colour', () => {
    const { config } = parseConfig('statuses:\n  - id: live\n    colour: emerald\n')
    expect(config.statuses[0]?.color).toBe('emerald')
  })

  it('preserves the author order, since it is the lifecycle order', () => {
    const { config } = parseConfig('statuses:\n  - zeta\n  - alpha\n')
    expect(config.statuses.map((status) => status.id)).toEqual(['zeta', 'alpha'])
  })

  it('reports an unknown colour and carries on', () => {
    const { config, problems } = parseConfig('statuses:\n  - id: live\n    color: chartreuse\n')
    expect(problems[0]).toContain('chartreuse')
    expect(config.statuses[0]?.color).toBe('slate')
  })

  it('rejects an id that is not slug-shaped', () => {
    const { config, problems } = parseConfig('statuses:\n  - id: "In Development"\n')
    expect(problems[0]).toContain('lowercase')
    // No usable entries, so the defaults stand rather than an empty list.
    expect(config.statuses).toEqual(DEFAULT_STATUSES)
  })

  it('drops a duplicate id and says so', () => {
    const { config, problems } = parseConfig('statuses:\n  - planned\n  - planned\n')
    expect(problems[0]).toContain('duplicate')
    expect(config.statuses).toHaveLength(1)
  })

  it('refuses to let a project define the reserved unknown colour', () => {
    const { config, problems } = parseConfig('statuses:\n  - id: live\n    color: unknown\n')
    expect(problems[0]).toContain('unknown')
    expect(config.statuses[0]?.color).toBe('slate')
  })

  it('falls back rather than throwing on malformed YAML', () => {
    const { config, problems } = parseConfig('statuses:\n  - [unclosed\n')
    expect(problems).toHaveLength(1)
    expect(config.statuses).toEqual(DEFAULT_STATUSES)
  })

  it('falls back when statuses is not a list', () => {
    const { config, problems } = parseConfig('statuses: planned\n')
    expect(problems[0]).toContain('must be a list')
    expect(config.statuses).toEqual(DEFAULT_STATUSES)
  })

  it('ignores unrelated keys', () => {
    const { config, problems } = parseConfig('somethingElse: true\n')
    expect(problems).toEqual([])
    expect(config.statuses).toEqual(DEFAULT_STATUSES)
  })
})

describe('default statuses', () => {
  it('describes lifecycle position, not effort', () => {
    // "In progress" was removed deliberately: a released feature is usually still being
    // worked on, so an effort-shaped status collides with every other state.
    expect(DEFAULT_STATUSES.map((status) => status.id)).toEqual([
      'planned',
      'pre-release',
      'released',
      'deprecated',
      'dropped',
    ])
  })

  it('has a unique id and a label for each entry', () => {
    const ids = DEFAULT_STATUSES.map((status) => status.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(DEFAULT_STATUSES.every((status) => status.label.trim() !== '')).toBe(true)
  })
})

describe('loadConfig', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chocks-config-'))
  })

  afterEach(async () => {
    await chmod(root, 0o700).catch(() => {})
    await rm(root, { recursive: true, force: true })
  })

  it('yields the defaults with nothing to report when there is no config', async () => {
    const { config, problems } = await loadConfig(root)
    expect(config.statuses).toEqual(DEFAULT_STATUSES)
    expect(problems).toEqual([])
  })

  it('reports an unreadable config rather than throwing', async () => {
    // loadConfig runs at startup, so throwing here would stop chocks running at all over
    // a file it can manage without.
    const file = path.join(root, CONFIG_FILENAME)
    await writeFile(file, 'statuses:\n  - idea\n', 'utf8')
    await chmod(file, 0o000)

    const { config, problems } = await loadConfig(root)

    expect(config.statuses).toEqual(DEFAULT_STATUSES)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`${CONFIG_FILENAME} could not be read`)
    expect(problems[0]).toContain('EACCES')
  })
})
