import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import type { Feature } from '@/lib/types'

/**
 * Renders a component that contains router Links.
 *
 * The real route tree is generated at build time and pulls in every page, so tests use a
 * minimal tree with the same paths. That keeps `to="/f/$featureKey"` type-checked and
 * resolvable without mounting the whole app.
 */
export async function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const featureRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/f/$featureKey',
    component: () => null,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, featureRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  // RouterProvider renders nothing until the route has resolved, which in tests happens
  // after the first paint. Loading up front avoids every query needing to be async.
  await router.load()
  // The app's own Register declaration types this against the generated tree.
  return render(<RouterProvider router={router as never} />)
}

export function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'auth',
    uid: 'a1b2c3d4e5',
    parent: '',
    title: 'Auth',
    description: '',
    status: 'planned',
    tags: [],
    links: [],
    sort: 'a0',
    ...overrides,
  }
}
