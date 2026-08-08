import { useQuery } from '@tanstack/react-query'
import { FilePlus2, GitCommitVertical, SquareDot, Tag } from 'lucide-react'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { Badge } from '@/ui/components/ui/badge'
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

/**
 * A feature's history, read straight from git.
 *
 * chocks has no revision model of its own: the repo already records who changed what and
 * why, usually in the same commit as the code the feature describes.
 */
export function FeatureHistory({ featureId }: { featureId: string }) {
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

  const events = [
    ...data.commits.map((commit) => ({ type: 'commit' as const, date: commit.date, commit })),
    ...data.tags.map((tag) => ({ type: 'tag' as const, date: tag.date, tag })),
  ].sort(
    (left, right) =>
      Date.parse(right.date) - Date.parse(left.date) ||
      Number(right.type === 'tag') - Number(left.type === 'tag'),
  )

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
          {events.map((event) =>
            event.type === 'tag' ? (
              <TimelineItem
                key={`tag:${event.tag.position}:${'name' in event.tag ? event.tag.name : ''}`}
              >
                <TimelineSeparator />
                <TimelineIndicator className="border-foreground text-foreground">
                  <Tag className="size-3.5" aria-hidden="true" />
                </TimelineIndicator>
                <TimelineHeader>
                  <TimelineTitle className="flex items-center gap-2">
                    <span>
                      {event.tag.position === 'first'
                        ? 'First shipped in'
                        : event.tag.position === 'current'
                          ? 'Current version shipped in'
                          : event.tag.position === 'unreleased'
                            ? 'Not yet in a release'
                            : 'Shipped in'}
                    </span>
                    {'name' in event.tag && (
                      <Badge variant="secondary" size="sm">
                        {event.tag.name}
                      </Badge>
                    )}
                  </TimelineTitle>
                </TimelineHeader>
                <TimelineContent>
                  <TimelineDate
                    dateTime={event.tag.date}
                    title={new Date(event.tag.date).toLocaleString()}
                  >
                    {relativeDate(event.tag.date)}
                  </TimelineDate>
                </TimelineContent>
              </TimelineItem>
            ) : (
              <TimelineItem key={event.commit.sha}>
                <TimelineSeparator />
                <TimelineIndicator
                  className={
                    event.commit.event === 'created'
                      ? 'border-foreground text-foreground'
                      : undefined
                  }
                >
                  {event.commit.event === 'created' ? (
                    <FilePlus2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <GitCommitVertical className="size-3.5" aria-hidden="true" />
                  )}
                </TimelineIndicator>
                <TimelineHeader>
                  <TimelineTitle className="flex min-w-0 items-center gap-2">
                    {event.commit.event === 'created' && (
                      <Badge variant="success" size="sm">
                        Created
                      </Badge>
                    )}
                    <span className="truncate">{event.commit.subject}</span>
                  </TimelineTitle>
                </TimelineHeader>
                <TimelineContent className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{event.commit.author}</span>
                    <span aria-hidden="true">·</span>
                    <TimelineDate
                      dateTime={event.commit.date}
                      title={new Date(event.commit.date).toLocaleString()}
                    >
                      {relativeDate(event.commit.date)}
                    </TimelineDate>
                    <span aria-hidden="true">·</span>
                    <code className="font-mono">
                      {event.commit.url ? (
                        <a
                          href={event.commit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-foreground underline-offset-4 hover:underline"
                        >
                          {event.commit.shortSha}
                        </a>
                      ) : (
                        event.commit.shortSha
                      )}
                    </code>
                  </div>
                </TimelineContent>
              </TimelineItem>
            ),
          )}
        </Timeline>
      )}
    </div>
  )
}
