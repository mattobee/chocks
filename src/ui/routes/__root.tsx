import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/ui/components/ui/sonner'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      <Outlet />
      {/* No richColors: it swaps sonner's own palette in over the theme tokens the
          component already wires up, so an error toast stops matching the rest of the UI. */}
      <Toaster />
    </>
  )
}
