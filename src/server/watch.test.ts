import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { watchFeatures } from './watch'

let root: string
let stop: (() => void) | undefined

beforeEach(async () => {
  // Named `.chocks` on purpose: the real root is a dotfile directory, and a naive
  // "ignore anything with a dot in the path" filter silently ignores the whole tree.
  const parent = await mkdtemp(path.join(tmpdir(), 'chocks-watch-'))
  root = path.join(parent, '.chocks')
  await mkdir(root, { recursive: true })
})

afterEach(async () => {
  stop?.()
  stop = undefined
  await rm(path.dirname(root), { recursive: true, force: true })
})

/** Resolves when onChange fires, or rejects after `timeout`. */
function nextChange(timeout = 3000): { promise: Promise<void>; fire: () => void } {
  let fire!: () => void
  const promise = new Promise<void>((resolve, reject) => {
    fire = resolve
    setTimeout(() => reject(new Error('watcher did not fire')), timeout).unref?.()
  })
  return { promise, fire }
}

describe('watchFeatures', () => {
  it('fires when a feature file inside a dot-directory root changes', async () => {
    const file = path.join(root, 'auth.md')
    await writeFile(file, '---\ntitle: Auth\n---\n', 'utf8')

    const { promise, fire } = nextChange()
    stop = watchFeatures(root, fire)
    // Give chokidar a moment to finish its initial scan before touching anything.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(file, '---\ntitle: Changed\n---\n', 'utf8')

    await expect(promise).resolves.toBeUndefined()
  })

  it('fires when a nested feature file is added', async () => {
    await mkdir(path.join(root, 'auth'), { recursive: true })
    const { promise, fire } = nextChange()
    stop = watchFeatures(root, fire)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(path.join(root, 'auth', 'oauth.md'), '---\ntitle: OAuth\n---\n', 'utf8')

    await expect(promise).resolves.toBeUndefined()
  })

  it('stops firing once torn down', async () => {
    let calls = 0
    const teardown = watchFeatures(root, () => calls++)
    await new Promise((resolve) => setTimeout(resolve, 300))
    teardown()

    await writeFile(path.join(root, 'late.md'), '---\ntitle: Late\n---\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(calls).toBe(0)
  })
})
