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

test.describe('renaming', () => {
  test('moves the file and keeps the link working', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await page.getByRole('link', { name: 'Billing' }).click()

    const heading = page.getByRole('textbox', { name: 'Feature title' })
    await expect(heading).toHaveValue('Billing')
    const before = page.url()

    await heading.fill('Billing and invoicing')
    await heading.blur()

    // The path is derived from the title, so the file moves.
    await expect
      .poll(async () => (await workspace.changed()).join(' '), { timeout: 5000 })
      .toContain('billing-and-invoicing')

    // The url is keyed on the uid, so the link survives the rename.
    await page.goto(before)
    await expect(page.getByRole('textbox', { name: 'Feature title' })).toHaveValue(
      'Billing and invoicing',
    )
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
    await expect(page.getByRole('textbox', { name: 'Feature title' })).toHaveValue(
      'OAuth providers',
    )

    const status = page.getByRole('status')
    await expect(status).toHaveText('All changes committed')

    await page.getByRole('textbox', { name: 'Description' }).fill('Now with Apple.')
    await page.getByRole('textbox', { name: 'Description' }).blur()

    await expect(status).toHaveText('Uncommitted changes', { timeout: 10_000 })

    // Committing does not touch the feature file, so this only clears if git is watched.
    await workspace.commit('docs: describe oauth')
    await expect(status).toHaveText('All changes committed', { timeout: 10_000 })
  })
})
