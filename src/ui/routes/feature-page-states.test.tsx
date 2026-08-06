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
import { ApiError } from '@/ui/lib/api'
import { UndoProvider } from '@/ui/hooks/use-undo'
import { DEFAULT_STATUSES } from '@/lib/status'

const listFeatures = vi.fn()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listFeatures: () => listFeatures(),
      workspace: () =>
        Promise.resolve({
          root: '/repo/.chocks',
          name: 'repo',
          version: '',
          releaseUrl: '',
          config: { statuses: DEFAULT_STATUSES },
        }),
    },
    // The route subscribes on mount; there is no server here to subscribe to.
    subscribeToChanges: () => () => {},
  }
})

afterEach(() => listFeatures.mockReset())

/**
 * The real feature page, at a url for a feature that is not in what came back.
 *
 * Mounted through a router because the component reads its own params. The point of the
 * test is the order of its branches, so it has to be the real component.
 */
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

describe('the feature page when the tree will not load', () => {
  it('says the load failed rather than claiming the feature was deleted', async () => {
    // The two are not the same thing, and saying the wrong one sends someone looking for a
    // problem that is not there.
    listFeatures.mockRejectedValue(new ApiError('Internal error', 500))

    await setup()

    expect(await screen.findByText(/Could not load the feature tree/)).toBeInTheDocument()
    expect(screen.queryByText(/may have been deleted/)).not.toBeInTheDocument()
  })

  it('reports what the server actually said', async () => {
    listFeatures.mockRejectedValue(new ApiError('EACCES: permission denied', 500))

    await setup()

    expect(await screen.findByText(/EACCES: permission denied/)).toBeInTheDocument()
  })

  it('offers a way out, since nothing retries on its own', async () => {
    listFeatures.mockRejectedValue(new ApiError('Internal error', 500))
    const user = await setup()

    const retry = await screen.findByRole('button', { name: 'Try again' })
    listFeatures.mockResolvedValue([])
    await user.click(retry)

    await waitFor(() => expect(listFeatures).toHaveBeenCalledTimes(2))
  })

  it('still says not found when the tree loads without it', async () => {
    listFeatures.mockResolvedValue([])

    await setup()

    expect(await screen.findByText(/may have been deleted/)).toBeInTheDocument()
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument()
  })
})
