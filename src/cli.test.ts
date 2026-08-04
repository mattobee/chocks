import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from './cli'

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'chocks-context-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

async function runContext(dir = root): Promise<string> {
  let output = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += String(chunk)
    return true
  })
  await main(['context', '--dir', dir])
  return output
}

async function feature(relativePath: string, frontmatter: string, description = ''): Promise<void> {
  const file = path.join(root, relativePath)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `---\n${frontmatter}\n---\n\n${description}\n`, 'utf8')
}

describe('chocks context', () => {
  it('prints nothing for an empty tree', async () => {
    expect(await runContext()).toBe('')
  })

  it('prints nothing when the feature directory does not exist', async () => {
    expect(await runContext(path.join(root, 'absent'))).toBe('')
  })

  it('reports ignored markdown files on stderr', async () => {
    await feature('auth.md', 'title: Authentication\nstatus: released')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await runContext()).toBe('')
    expect(error).toHaveBeenCalledWith(
      'chocks: skipped 1 markdown file(s) without the .chocks.md suffix',
    )
  })

  it('prints a nested tree with first description paragraphs in stable order', async () => {
    await feature(
      'auth/index.chocks.md',
      'title: Authentication\nstatus: released\ntags: [security]\nsort: a0',
      'Sign in and out.',
    )
    await feature(
      'auth/passwords.chocks.md',
      'title: Passwords\nstatus: planned\ntags: [security, accounts]\nsort: a1',
      'Reset passwords.\n\nIncludes expiry.',
    )
    await feature(
      'auth/oauth.chocks.md',
      'title: OAuth\nstatus: pre-release\ntags: [api]\nsort: a0',
      'Connect providers.',
    )

    const expected =
      [
        {
          path: 'auth',
          title: 'Authentication',
          status: 'released',
          tags: ['security'],
          description: 'Sign in and out.',
        },
        {
          path: 'auth/oauth',
          title: 'OAuth',
          status: 'pre-release',
          tags: ['api'],
          description: 'Connect providers.',
        },
        {
          path: 'auth/passwords',
          title: 'Passwords',
          status: 'planned',
          tags: ['security', 'accounts'],
          description: 'Reset passwords.',
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n'

    expect(await runContext()).toBe(expected)
    expect(await runContext()).toBe(expected)
  })

  it('preserves statuses from a custom status set', async () => {
    await writeFile(
      path.join(root, 'config.yaml'),
      'statuses:\n  - id: idea\n    label: Idea\n    color: slate\n  - id: shipped\n    label: Shipped\n    color: emerald\n',
      'utf8',
    )
    await feature(
      'search.chocks.md',
      'title: Search\nstatus: shipped\ntags: [discovery]\nsort: a0',
      'Find features.',
    )

    expect(await runContext()).toBe(
      `${JSON.stringify({
        path: 'search',
        title: 'Search',
        status: 'shipped',
        tags: ['discovery'],
        description: 'Find features.',
      })}\n`,
    )
  })
})
