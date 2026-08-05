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
  let packed: string[]

  test.beforeAll(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'chocks-packaged-'))
    await run('git', ['-C', workdir, 'init', '-q', '-b', 'main'])

    // --out fixes the path, so there is no pack output to parse.
    const tarball = path.join(workdir, 'chocks.tgz')
    await run('pnpm', ['pack', '--out', tarball], { cwd: REPO_ROOT })

    const { stdout } = await run('tar', ['-tzf', tarball])
    packed = stdout
      .split('\n')
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//, ''))

    await run('pnpm', ['add', tarball], { cwd: workdir })
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
    // Asserted against the tarball rather than the installed directory: package managers
    // lay installs out differently, and pnpm nests a node_modules inside the package.
    const top = [...new Set(packed.map((entry) => entry.split('/')[0]))].sort()
    expect(top).toEqual(['LICENSE', 'README.md', 'dist', 'package.json'])

    expect(packed.filter((entry) => /\.test\.|^src\/|^e2e\//.test(entry))).toEqual([])

    // Verify package metadata declares no runtime dependencies
    const { readFile } = await import('node:fs/promises')
    const pkgJsonRaw = await readFile(
      path.join(workdir, 'node_modules', '@mattobee', 'chocks', 'package.json'),
      'utf8',
    )
    const pkgJson = JSON.parse(pkgJsonRaw)
    expect(pkgJson.dependencies || {}).toEqual({})
    expect(pkgJson.optionalDependencies || {}).toEqual({})
  })

  test('serves its own UI assets from inside the package', async ({ page }) => {
    const failures: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
    })

    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'chocks', level: 1 })).toBeVisible()
    expect(failures).toEqual([])
  })

  test('creates .chocks and writes a feature through the packaged build', async ({ page }) => {
    await page.goto(url)

    await page.getByRole('button', { name: 'New feature' }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill('Installed and working')
    await page.getByRole('button', { name: 'Create' }).click()

    // Scoped to the tree: creating navigates straight to the new feature, and its
    // breadcrumb's current-page entry carries the same accessible name and role.
    await expect(
      page.getByRole('tree').getByRole('link', { name: 'Installed and working' }),
    ).toBeVisible()
    const files = await readdir(path.join(workdir, '.chocks'))
    expect(files).toContain('installed-and-working.chocks.md')
  })

  test('resolves a deep client-side route', async ({ page }) => {
    await page.goto(`${url}/f/nonexistent~aaa0000001`)
    // The shell is served for unknown paths, so the app renders its own not-found.
    await expect(page.getByText(/No feature matching/)).toBeVisible()
  })
})
