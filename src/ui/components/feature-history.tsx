import { useQuery } from '@tanstack/react-query'
import { GitCommitVertical, SquareDot } from 'lucide-react'
import { Skeleton } from '@/ui/components/ui/skeleton'
import { historyQuery } from '@/ui/lib/queries'

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
          <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
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
        <ol className="flex flex-col">
          {data.commits.map((commit) => (
            <li key={commit.sha} className="flex items-baseline gap-2.5 py-1.5 text-sm">
              <GitCommitVertical className="text-muted-foreground size-4 shrink-0 self-center" />
              <span className="flex-1 truncate" title={commit.subject}>
                {commit.subject}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">{commit.author}</span>
              <time
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
                dateTime={commit.date}
                title={new Date(commit.date).toLocaleString()}
              >
                {relativeDate(commit.date)}
              </time>
              <code className="text-muted-foreground shrink-0 font-mono text-xs">
                {commit.shortSha}
              </code>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

function relativeDate(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''

  const elapsed = time - Date.now()
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return format.format(Math.round(elapsed / ms), unit)
  }
  return format.format(0, 'minute')
}
