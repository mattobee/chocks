import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FolderGit2 } from 'lucide-react'
import { ColorModeSwitcher } from '@/ui/components/color-mode-switcher'
import { workspaceQuery } from '@/ui/lib/queries'

/** One place to change the page width, so pages can't drift apart. */
const CONTAINER = 'mx-auto w-full max-w-4xl px-6'

export function AppShell({ children }: { children: ReactNode }) {
  const workspace = useQuery(workspaceQuery())

  return (
    <div className="flex min-h-svh flex-col">
      {/* Border spans the viewport; the contents line up with the page below it. */}
      <header className="border-b">
        <div className={`${CONTAINER} flex items-center gap-3 py-3`}>
          <Link to="/" className="font-semibold tracking-tight">
            chocks
          </Link>
          {workspace.data && (
            <span
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
              title={workspace.data.root}
            >
              <FolderGit2 className="size-4" aria-hidden="true" />
              {workspace.data.name}
            </span>
          )}
          <div className="ms-auto">
            <ColorModeSwitcher />
          </div>
        </div>
      </header>

      <main className={`${CONTAINER} flex-1 py-6`}>{children}</main>
    </div>
  )
}
