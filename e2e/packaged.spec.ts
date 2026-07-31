import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'

const run = promisify(execFile)
const REPO_ROOT = path.resolve(import.meta.dirname, '..')

/**
 * Runs chocks the way a user gets it: packed, installed, launched from node_modules.
 *
 * The other suites run `dist/cli.mjs` from the repo, which hides anything that depends on
 * install layout. The UI assets used to be served relative to `process.cwd()`, which works
 * in development and breaks entirely under npx, because the cwd is then the user's repo
 * rather than the installed package.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

test.describe('packaged artefact', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })

  let workdir: string
  let server: ChildProcess | undefined
  let url: string

  test.beforeAll(async () => {
    const { stdout } = await run('npm', ['pack', '--silent'], { cwd: REPO_ROOT })
    const tarball = path.join(REPO_ROOT, stdout.trim().split('\n').pop() ?? '')

    workdir = await mkdtemp(path.join(tmpdir(), 'chocks-packaged-'))
    await run('git', ['-C', workdir, 'init', '-q', '-b', 'main'])
    await run('npm', ['install', '--silent', '--no-audit', '--no-fund', tarball], { cwd: workdir })
    await rm(tarball, { force: true })

    const port = await freePort()
    url = `http://127.0.0.1:${port}`
    server = spawn(
      path.join(workdir, 'node_modules', '.bin', 'chocks'),
      ['--no-open', '--port', String(port)],
      { cwd: workdir, stdio: 'ignore' },
    )

    const deadline = Date.now() + 30_000
    for (;;) {
      try {
        if ((await fetch(`${url}/api/workspace`)).ok) break
      } catch {
        // Not up yet.
      }
      if (Date.now() > deadline) throw new Error('packaged chocks did not start')
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  })

  test.afterAll(async () => {
    server?.kill('SIGTERM')
    if (workdir) await rm(workdir, { recursive: true, force: true })
  })

  test('ships no tests or sources', async () => {
    const packaged = path.join(workdir, 'node_modules', 'chocks')
    const entries = await readdir(packaged)
    expect(entries.sort()).toEqual(['LICENSE', 'README.md', 'dist', 'package.json'])
  })

  test('serves its own UI assets from inside the package', async ({ page }) => {
    const failures: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
    })

    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible()
    expect(failures).toEqual([])
  })

  test('creates .chocks and writes a feature through the packaged build', async ({ page }) => {
    await page.goto(url)

    await page.getByRole('button', { name: 'New feature' }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill('Installed and working')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByRole('link', { name: 'Installed and working' })).toBeVisible()
    const files = await readdir(path.join(workdir, '.chocks'))
    expect(files).toContain('installed-and-working.feature.md')
  })

  test('resolves a deep client-side route', async ({ page }) => {
    await page.goto(`${url}/f/nonexistent~aaa0000001`)
    // The shell is served for unknown paths, so the app renders its own not-found.
    await expect(page.getByText(/No feature matching/)).toBeVisible()
  })
})
