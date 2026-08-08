import { useQuery } from '@tanstack/react-query'
import { FilePlus2, GitCommitVertical, SquareDot } from 'lucide-react'
import { Skeleton } from '@/ui/components/ui/skeleton'
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/ui/components/ui/timeline'
import { historyQuery } from '@/ui/lib/queries'
import { relativeDate } from '@/ui/lib/dates'
import { MODIFIED_COLOR } from '@/lib/status'
import type { StatusDefinition } from '@/lib/status'
import { StatusBadge } from '@/ui/components/status-badge'

/**
 * A feature's history, read straight from git.
 *
 * chocks has no revision model of its own: the repo already records who changed what and
 * why, usually in the same commit as the code the feature describes.
 */
export function FeatureHistory({
  featureId,
  statuses,
}: {
  featureId: string
  statuses: StatusDefinition[]
}) {
  const history = useQuery(historyQuery(featureId))

  if (history.isPending) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    )
  }

  const data = history.data
  if (!data || data.unavailable) {
    return (
      <p className="text-muted-foreground text-sm">
        {data?.unavailable === 'not-a-repo'
          ? 'Not a git repository, so there is no history to show.'
          : data?.unavailable === 'git-missing'
            ? 'git is not on the PATH, so history is unavailable.'
            : 'Could not read history from git.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        This flips on its own — a file watcher drives it, not a user action — so the change
        has to be announced. The container is rendered unconditionally because a live
        region only announces content that changes *after* it is in the DOM; toggling the
        region itself would announce nothing.

        The committed state is visually silent but still has text, so the announcement
        works in both directions and a screen reader user can read the current state on
        arrival rather than only hearing it change.
      */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {data.uncommitted ? (
          <span className={`flex items-center gap-1.5 text-sm ${MODIFIED_COLOR}`}>
            <SquareDot className="size-4" aria-hidden="true" />
            Modified
          </span>
        ) : (
          <span className="sr-only">All changes committed</span>
        )}
      </div>

      {data.commits.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Not committed yet — history appears once this file is in a commit.
        </p>
      ) : (
        <Timeline>
          {data.commits.map((commit) => (
            <TimelineItem key={commit.sha}>
              <TimelineSeparator />
              <TimelineIndicator
                className={
                  commit.event === 'created' ? 'border-foreground text-foreground' : undefined
                }
              >
                {commit.event === 'created' ? (
                  <FilePlus2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <GitCommitVertical className="size-3.5" aria-hidden="true" />
                )}
              </TimelineIndicator>
              <TimelineHeader>
                <TimelineTitle className="flex min-w-0 items-center gap-2">
                  <span className="truncate">
                    {commit.event === 'created' ? 'First added to Chocks' : commit.subject}
                  </span>
                  {commit.event === 'created' && commit.statusChange?.to && (
                    <>
                      <span>as</span>
                      <StatusBadge statuses={statuses} status={commit.statusChange.to} />
                    </>
                  )}
                </TimelineTitle>
              </TimelineHeader>
              <TimelineContent className="flex flex-col gap-1.5">
                {commit.statusChange && commit.event !== 'created' && (
                  <div className="text-foreground flex flex-wrap items-center gap-1.5">
                    {commit.statusChange.from && commit.statusChange.to ? (
                      <>
                        <span>Status changed from</span>
                        <StatusBadge statuses={statuses} status={commit.statusChange.from} />
                        <span>to</span>
                        <StatusBadge statuses={statuses} status={commit.statusChange.to} />
                      </>
                    ) : commit.statusChange.to ? (
                      <>
                        <span>Status set to</span>
                        <StatusBadge statuses={statuses} status={commit.statusChange.to} />
                      </>
                    ) : (
                      <>
                        <span>Status removed from</span>
                        <StatusBadge statuses={statuses} status={commit.statusChange.from!} />
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{commit.author}</span>
                  <span aria-hidden="true">·</span>
                  <TimelineDate
                    dateTime={commit.date}
                    title={new Date(commit.date).toLocaleString()}
                  >
                    {relativeDate(commit.date)}
                  </TimelineDate>
                  <span aria-hidden="true">·</span>
                  <code className="font-mono">
                    {commit.url ? (
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground underline-offset-4 hover:underline"
                      >
                        {commit.shortSha}
                      </a>
                    ) : (
                      commit.shortSha
                    )}
                  </code>
                  <span aria-hidden="true">·</span>
                  <span>{commit.release ? `in ${commit.release}` : 'not yet in a release'}</span>
                </div>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      )}
    </div>
  )
}
