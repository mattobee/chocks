import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

/**
 * axe is the floor, not the ceiling. It catches generic structural problems; the
 * assertions below check the computed accessibility tree for the things this app actually
 * relies on, which no scanner knows to look for.
 */

test.describe('axe', () => {
  test('finds nothing on the tree', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await expect(page.getByRole('link', { name: 'Authentication' })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations).toEqual([])
  })

  test('finds nothing on a feature page', async ({ page, workspace }) => {
    await page.goto(`${workspace.url}/f/oauth~aaa0000002`)
    await expect(page.getByRole('textbox', { name: 'Feature title' })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations).toEqual([])
  })
})

test.describe('accessible names', () => {
  test('names every icon-only control on a row', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    const row = page.getByRole('listitem').first()
    await row.hover()

    // These have no visible text, so a regression is invisible without this.
    await expect(row.getByRole('button').nth(0)).toHaveAccessibleName('Expand')
    await expect(row.getByRole('button', { name: 'Drag to reorder' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Add child of Authentication' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Actions for Authentication' })).toBeVisible()
    await expect(row.getByRole('combobox')).toHaveAccessibleName('Status of Authentication')
  })

  test('names the colour mode control and its options', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    const group = page.getByRole('radiogroup', { name: 'Colour mode' })
    await expect(group).toBeVisible()

    for (const name of ['System', 'Light', 'Dark']) {
      await expect(group.getByRole('radio', { name })).toBeVisible()
    }
    await expect(group.getByRole('radio', { name: 'System' })).toBeChecked()
  })
})

test.describe('breadcrumb', () => {
  test('marks the current feature and links its ancestors', async ({ page, workspace }) => {
    await page.goto(`${workspace.url}/f/github~aaa0000003`)

    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Features' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Authentication' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'OAuth providers' })).toBeVisible()

    // The trail ends on the current page, which carries aria-current.
    await expect(nav.getByText('GitHub')).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('keyboard', () => {
  test('reaches the tree controls without a mouse', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    await expect(page.getByRole('link', { name: 'Authentication' })).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'chocks' })).toBeFocused()

    // Arrow keys move within the radio group, which is why it is a radio group.
    await page.getByRole('radio', { name: 'System' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Light' })).toBeFocused()
  })

  test('opens and operates the row menu from the keyboard', async ({ page, workspace }) => {
    await page.goto(workspace.url)
    const trigger = page.getByRole('button', { name: 'Actions for Authentication' })
    await trigger.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeHidden()
  })
})

test.describe('search results', () => {
  test('announces the match count as the query changes', async ({ page, workspace }) => {
    await page.goto(workspace.url)

    // Named because dnd-kit injects its own assertive status region for drag
    // announcements, so the tree has two. The region also has to exist before it
    // populates, or the first result is never announced.
    const status = page.getByRole('status', { name: 'Search results' })
    await expect(status).toBeAttached()

    await page.getByRole('searchbox', { name: 'Search features' }).fill('oauth')
    await expect(status).toHaveText('1 match')

    await page.getByRole('searchbox', { name: 'Search features' }).fill('nothing here')
    await expect(status).toHaveText('0 matches')
  })
})
