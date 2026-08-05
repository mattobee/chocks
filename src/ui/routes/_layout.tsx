import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Separator } from '@/ui/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/ui/components/ui/sidebar'
import { AppSidebar } from '@/ui/components/app-sidebar'
import { ColorModeSwitcher } from '@/ui/components/color-mode-switcher'

export const Route = createFileRoute('/_layout')({
  component: SidebarLayout,
})

function SidebarLayout() {
  return (
    <SidebarProvider>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
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
