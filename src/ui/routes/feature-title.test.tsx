import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UndoProvider } from '@/ui/hooks/use-undo'
import { DEFAULT_STATUSES } from '@/lib/status'

const updateFeature = vi.fn()
/** Hoisted so the mock factory can read it, and so a test can vary it before rendering. */
const fixture = vi.hoisted(() => ({ description: 'Plans and invoices.' }))

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  const billing = {
    id: 'billing',
    uid: 'aaa0000005',
    parent: '',
    title: 'Billing',
    get description() {
      return fixture.description
    },
    status: 'idea',
    tags: [],
    links: {},
    sort: 'a0',
  }
  return {
    ...actual,
    api: {
      ...actual.api,
      listFeatures: () => Promise.resolve([billing]),
      updateFeature: (id: string, patch: unknown) => {
        updateFeature(id, patch)
        return Promise.resolve({ ...billing, ...(patch as object) })
      },
      workspace: () =>
        Promise.resolve({
          root: '/repo/.chocks',
          name: 'repo',
          version: '',
          releaseUrl: '',
          config: { statuses: DEFAULT_STATUSES },
        }),
    },
    subscribeToChanges: () => () => {},
  }
})

afterEach(() => {
  updateFeature.mockReset()
  fixture.description = 'Plans and invoices.'
})

async function setup() {
  const { FeaturePage } = await import('./_layout/f.$featureKey')
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const featureRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/f/$featureKey',
    component: FeaturePage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, featureRoute]),
    history: createMemoryHistory({ initialEntries: ['/f/billing~aaa0000005'] }),
  })
  await router.load()

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <UndoProvider>
        <RouterProvider router={router as never} />
      </UndoProvider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const rename = () => screen.getByRole('button', { name: 'Rename feature' })

describe('the feature title', () => {
  it('is the page heading, not a text box', async () => {
    // It used to be an input dressed as a heading, so the page had no h1 at all and
    // nothing to navigate to.
    await setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Billing' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Feature title' })).not.toBeInTheDocument()
  })

  it('becomes editable on request, with the text ready to replace', async () => {
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())

    const field = screen.getByRole('textbox', { name: 'Feature title' })
    expect(field).toHaveFocus()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('saves on Enter', async () => {
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('Invoicing{Enter}')

    expect(updateFeature).toHaveBeenCalledWith('billing', { title: 'Invoicing' })
  })

  it('closes the editor on Enter', async () => {
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('Invoicing{Enter}')

    expect(screen.queryByRole('textbox', { name: 'Feature title' })).not.toBeInTheDocument()
  })

  it('saves once, not twice, when Enter is followed by the field going away', async () => {
    // Enter takes the field away and the browser fires blur at it, so both paths run.
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('Invoicing{Enter}')

    expect(updateFeature).toHaveBeenCalledTimes(1)
  })

  it('discards the edit on Escape', async () => {
    // The old code reverted the value and then blurred, and blur read the state from
    // before the revert, so Escape saved the very thing it was meant to throw away.
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('Invoicing{Escape}')

    expect(updateFeature).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { level: 1, name: 'Billing' })).toBeInTheDocument()
  })

  it('puts focus back where it came from', async () => {
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('{Escape}')

    // Deferred past the key sequence, so it is not focused on the same tick.
    await waitFor(() => expect(rename()).toHaveFocus())
  })

  it('leaves the title alone when nothing changed', async () => {
    const user = await setup()
    await screen.findByRole('heading', { level: 1, name: 'Billing' })

    await user.click(rename())
    await user.keyboard('{Enter}')

    expect(updateFeature).not.toHaveBeenCalled()
  })
})

const editDescription = () => screen.getByRole('button', { name: 'Edit description' })

describe('the feature description', () => {
  it('is shown as text, not a permanent text box', async () => {
    await setup()

    expect(await screen.findByText('Plans and invoices.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
  })

  it('becomes editable on request', async () => {
    const user = await setup()
    await screen.findByText('Plans and invoices.')

    await user.click(editDescription())

    const field = screen.getByRole('textbox', { name: 'Description' })
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Plans and invoices.')
  })

  it('keeps Enter for the text and saves on the modifier', async () => {
    // A description is mostly line breaks, so Enter cannot mean save the way it does for
    // the title.
    const user = await setup()
    await screen.findByText('Plans and invoices.')

    await user.click(editDescription())
    await user.keyboard('{Enter}and more')
    expect(updateFeature).not.toHaveBeenCalled()

    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(updateFeature).toHaveBeenCalledTimes(1)
  })

  it('saves what was typed', async () => {
    const user = await setup()
    await screen.findByText('Plans and invoices.')

    await user.click(editDescription())
    await user.clear(screen.getByRole('textbox', { name: 'Description' }))
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Rewritten.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateFeature).toHaveBeenCalledWith('billing', { description: 'Rewritten.' })
  })

  it('discards the edit on Cancel', async () => {
    const user = await setup()
    await screen.findByText('Plans and invoices.')

    await user.click(editDescription())
    await user.type(screen.getByRole('textbox', { name: 'Description' }), ' Extra.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(updateFeature).not.toHaveBeenCalled()
    expect(await screen.findByText('Plans and invoices.')).toBeInTheDocument()
  })

  it('can be emptied', async () => {
    const user = await setup()
    await screen.findByText('Plans and invoices.')

    await user.click(editDescription())
    await user.clear(screen.getByRole('textbox', { name: 'Description' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateFeature).toHaveBeenCalledWith('billing', { description: '' })
  })

  it('says so when there is nothing written yet', async () => {
    // Otherwise the section is blank and the edit button has nothing to explain it.
    fixture.description = ''
    await setup()

    expect(await screen.findByText('No description yet.')).toBeInTheDocument()
  })
})
