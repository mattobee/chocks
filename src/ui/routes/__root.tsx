import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { Toaster } from '@/ui/components/ui/sonner'
import { TooltipProvider } from '@/ui/components/ui/tooltip'
import { UndoProvider } from '@/ui/hooks/use-undo'
import { useUndoShortcut } from '@/ui/hooks/use-undo-shortcut'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

/** Registered here rather than per page, so the stack works wherever you are. */
function Shortcuts() {
  useUndoShortcut()
  return null
}

function RootLayout() {
  return (
    <HotkeysProvider>
      <TooltipProvider>
        <UndoProvider>
          <Shortcuts />
          <Outlet />
          {/* No richColors: it swaps sonner's own palette in over the theme tokens the
              component already wires up, so an error toast stops matching the rest of the UI. */}
          <Toaster />
        </UndoProvider>
      </TooltipProvider>
    </HotkeysProvider>
  )
}
