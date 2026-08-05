import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/ui/components/ui/sidebar'
import { AppSidebar } from '@/ui/components/app-sidebar'
import { ColorModeSwitcher } from '@/ui/components/color-mode-switcher'

export const Route = createFileRoute('/_layout')({
  component: SidebarLayout,
})

function SidebarLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
          </div>
          <div className="ms-auto">
            <ColorModeSwitcher />
          </div>
        </header>
        {/* Same width the single-column layout used before the sidebar, kept for the same
            reason: feature descriptions are prose, and a page-wide line is hard to read. */}
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
