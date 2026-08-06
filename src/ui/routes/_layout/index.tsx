import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FolderGit2 } from 'lucide-react'
import { featuresQuery } from '@/ui/lib/queries'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/ui/empty'

export const Route = createFileRoute('/_layout/')({
  component: WelcomePage,
})

function WelcomePage() {
  const features = useQuery(featuresQuery())
  const count = features.data?.length ?? 0

  return (
    <Empty className="mx-auto max-w-md border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderGit2 aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle render={<h1 />}>chocks</EmptyTitle>
        <p className="text-muted-foreground mt-2 text-sm">
          Track features as a tree stored in your repo.
        </p>
      </EmptyHeader>
      <EmptyContent>
        <p className="text-muted-foreground text-xs">
          {count > 0
            ? `${count} feature${count === 1 ? '' : 's'} in this workspace`
            : 'No features yet'}
        </p>
      </EmptyContent>
    </Empty>
  )
}
