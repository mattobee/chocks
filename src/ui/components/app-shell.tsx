import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FolderGit2 } from 'lucide-react'
import { workspaceQuery } from '@/ui/lib/queries'

export function AppShell({ children }: { children: ReactNode }) {
  const workspace = useQuery(workspaceQuery())

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          chocks
        </Link>
        {workspace.data && (
          <span
            className="text-muted-foreground flex items-center gap-1.5 text-sm"
            title={workspace.data.root}
          >
            <FolderGit2 className="size-4" />
            {workspace.data.name}
          </span>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
