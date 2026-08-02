import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.describe('creating', () => {
  test('writes a feature file with the right frontmatter', async ({ page, workspace }) => {
    await page.goto(workspace.url)

    await page.getByRole('button', { name: 'New feature' }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill('Password reset')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Planned' }).click()
    await page.getByRole('textbox', { name: 'Tags' }).fill('auth, security')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByRole('link', { name: 'Password reset' })).toBeVisible()

    const file = await workspace.read('password-reset')
    expect(file).toContain('title: Password reset')
    expect(file).toContain('status: planned')
    expect(file).toContain('- auth')
    expect(file).toContain('- security')
  })

  test('refuses an empty title and says why', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('button', { name: 'New feature' }).click()

    // The submit stays enabled on purpose, so the reason can be reported.
    const create = page.getByRole('button', { name: 'Create' })
    await expect(create).toBeEnabled()
    await create.click()

    const title = page.getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveAccessibleErrorMessage('Enter a title.')
    await expect(title).toBeFocused()
  })
})

test.describe('reordering', () => {
  test('rewrites one file and leaves the neighbours alone', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    // Authentication and Billing are both top level, so this is a pure sibling reorder.
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible()

    const handle = page.getByRole('button', { name: 'Drag to reorder' }).nth(1)
    const box = await handle.boundingBox()
    const target = await page.getByRole('link', { name: 'Authentication' }).boundingBox()
    if (!box || !target) throw new Error('rows not laid out')

    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + box.height / 2)
    await page.mouse.down()
    // Horizontal position must not change, or the drop projects as a reparent rather than
    // a reorder. dnd-kit also needs more than 4px of travel to treat this as a drag.
    await page.mouse.move(x, box.y + box.height / 2 - 10, { steps: 5 })
    await page.mouse.move(x, target.y - 4, { steps: 10 })
    await page.mouse.up()

    // The whole point of fractional index keys: one file rewritten, neighbours untouched.
    await expect.poll(async () => await workspace.changed(), { timeout: 5000 }).toHaveLength(1)
    expect((await workspace.changed())[0]).toBe('.chocks/billing.feature.md')
  })
})

/** The title is a heading until you ask to edit it, so every rename starts with a click. */
async function renameTo(page: Page, next: string) {
  await page.getByRole('button', { name: 'Rename feature' }).click()
  const field = page.getByRole('textbox', { name: 'Feature title' })
  await field.fill(next)
  await field.press('Enter')
}

const titleHeading = (page: Page) => page.getByRole('heading', { level: 1 })

test.describe('renaming', () => {
  test('moves the file and keeps the link working', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('link', { name: 'Billing' }).click()

    await expect(titleHeading(page)).toHaveText('Billing')
    const before = page.url()

    await renameTo(page, 'Billing and invoicing')

    // The path is derived from the title, so the file moves. Polled rather than read once:
    // the rename returns before the watcher has reported the write.
    await expect
      .poll(async () => (await workspace.changed()).join(' '), { timeout: 5000 })
      .toContain('billing-and-invoicing')

    // The url is keyed on the uid, so the link survives the rename.
    await page.goto(before)
    await expect(titleHeading(page)).toHaveText('Billing and invoicing')
  })
})

test.describe('live reload', () => {
  test('picks up an edit made outside the app', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible()

    await workspace.write(
      'billing',
      '---\ntitle: Billing and plans\nstatus: idea\nsort: a1\nuid: aaa0000005\n---\n\nEdited on disk.\n',
    )

    // No reload: the file watcher pushes the change over SSE.
    await expect(page.getByRole('link', { name: 'Billing and plans' })).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe('uncommitted indicator', () => {
  test('announces the change without a reload', async ({ page, workspace }) => {
    await page.goto(`${workspace.url}/f/oauth~aaa0000002`)
    await expect(titleHeading(page)).toHaveText('OAuth providers')

    const status = page.getByRole('status')
    await expect(status).toHaveText('All changes committed')

    await page.getByRole('button', { name: 'Edit description' }).click()
    await page.getByRole('textbox', { name: 'Description' }).fill('Now with Apple.')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(status).toHaveText('Uncommitted changes', { timeout: 10_000 })

    // Committing does not touch the feature file, so this only clears if git is watched.
    await workspace.commit('docs: describe oauth')
    await expect(status).toHaveText('All changes committed', { timeout: 10_000 })
  })
})

test.describe('undo', () => {
  /**
   * How many entries the undo stack holds.
   *
   * Tests wait on this rather than on the files, because the file is written server-side
   * well before the client hears back and records anything. Pressing undo on the strength
   * of the file alone races the entry being stored, which is reliably lost on a loaded
   * machine and only sometimes lost on a fast one.
   */
  const undoStackSize = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const raw = sessionStorage.getItem('chocks:undo')
      return raw ? ((JSON.parse(raw) as { undo: unknown[] }).undo.length ?? 0) : 0
    })

  test('puts a renamed feature back, file and all', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('link', { name: 'Billing' }).click()

    await renameTo(page, 'Invoicing')
    await expect.poll(() => undoStackSize(page), { timeout: 10_000 }).toBe(1)

    // Committing closes the editor, so focus is already back on a button rather than in
    // the field, where Cmd+Z would belong to the browser.
    await page.keyboard.press('ControlOrMeta+z')

    await expect(titleHeading(page)).toHaveText('Billing')
    await expect
      .poll(async () => (await workspace.read('billing')).includes('title: Billing'), {
        timeout: 5000,
      })
      .toBe(true)
  })

  test('restores a deleted subtree with its uids intact', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('button', { name: 'Expand' }).first().click()

    await page.getByRole('button', { name: 'Actions for OAuth providers' }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('link', { name: 'OAuth providers' })).toBeHidden()
    await expect.poll(() => undoStackSize(page), { timeout: 10_000 }).toBe(1)

    // Straight after confirming, which is when you actually reach for undo. The dialog is
    // still in the DOM at this point, closed but mounted.
    await page.keyboard.press('ControlOrMeta+z')

    await expect(page.getByRole('link', { name: 'OAuth providers' })).toBeVisible()

    // Poll rather than read once. Restoring is one create per feature, so the parent's row
    // is back on screen while its children are still being written.
    const uids = ['auth/oauth', 'auth/oauth/github', 'auth/oauth/google']
    await expect
      .poll(
        async () =>
          Promise.all(uids.map((id) => workspace.read(id).catch(() => ''))).then((files) =>
            files.every((file) => file.includes('uid: aaa')),
          ),
        { timeout: 10_000 },
      )
      .toBe(true)

    // The uid is the whole point: a restored feature has to be the same feature, or every
    // link to it is broken.
    expect(await workspace.read('auth/oauth')).toContain('uid: aaa0000002')
    expect(await workspace.read('auth/oauth/github')).toContain('uid: aaa0000003')
    expect(await workspace.read('auth/oauth/google')).toContain('uid: aaa0000004')
  })

  test('survives a refresh', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('link', { name: 'Billing' }).click()

    await renameTo(page, 'Invoicing')
    await expect.poll(() => undoStackSize(page), { timeout: 10_000 }).toBe(1)

    await page.reload()
    await expect(titleHeading(page)).toHaveText('Invoicing')

    await page.keyboard.press('ControlOrMeta+z')

    await expect(titleHeading(page)).toHaveText('Billing')
    await expect
      .poll(async () => (await workspace.read('billing')).includes('title: Billing'), {
        timeout: 5000,
      })
      .toBe(true)
  })

  test('leaves typing to the browser', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('link', { name: 'Billing' }).click()

    await page.getByRole('button', { name: 'Rename feature' }).click()
    const heading = page.getByRole('textbox', { name: 'Feature title' })
    await heading.press('End')
    await heading.pressSequentially(' and invoicing')
    await page.keyboard.press('ControlOrMeta+z')

    // The browser took it, so some of the typing went. Exactly how much is Chromium's
    // business and not worth pinning.
    await expect(heading).not.toHaveValue('Billing and invoicing')
    // What matters is that the app kept out of it: no toast, and nothing written. Had the
    // shortcut fired with an empty stack it would have said "Nothing left to undo".
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    expect(await workspace.changed()).toHaveLength(0)
  })
})
