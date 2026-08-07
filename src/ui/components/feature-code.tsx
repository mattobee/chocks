import { useQuery } from '@tanstack/react-query'
import { Code, Flag, FlaskConical, TriangleAlert } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/components/ui/table'
import { codeMatchesQuery } from '@/ui/lib/queries'
import { relativeDate } from '@/ui/lib/dates'
import { cn } from '@/lib/utils'
import type { CodeKind, FeatureCodeRef } from '@/lib/types'

const CODE_KIND_INFO: Record<CodeKind, { icon: typeof Code; label: string }> = {
  code: { icon: Code, label: 'Code' },
  test: { icon: FlaskConical, label: 'Test' },
  flag: { icon: Flag, label: 'Feature flag' },
}

/**
 * Not links: a `code` entry is a glob, not a URL, so it renders as plain text rather than
 * something to click.
 */
export function FeatureCode({ featureId, code }: { featureId: string; code: FeatureCodeRef[] }) {
  const matches = useQuery(codeMatchesQuery(featureId, code.length > 0))

  if (code.length === 0) return null

  // Matched by position against the feature's own `code`, which is the order this table is
  // rendered in. A mismatched length (a stale response, or one still loading) just means no
  // cell content yet for the entries past it, rather than a wrong one.
  const entries = matches.data?.matches

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Code</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Path</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Matches</TableHead>
            <TableHead>Changed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {code.map(({ path, kind }, index) => {
            const { icon: Icon, label: kindLabel } = CODE_KIND_INFO[kind ?? 'code']
            const count = entries?.[index]?.count
            const lastCommit = entries?.[index]?.lastCommit ?? null

            return (
              <TableRow key={`${path}:${index}`}>
                {/* Font metrics differ between the mono path and the plain-font cells beside
                    it, so neither `vertical-align: middle` nor `baseline` on the `<td>` lines
                    them up reliably. Flex-centering each cell's content against its own
                    rendered height sidesteps that entirely: it centres the box, not a
                    baseline, so it doesn't care what font produced it. */}
                <TableCell className="font-mono text-muted-foreground">
                  <span className="flex h-full items-center gap-1.5">
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {path}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="flex h-full items-center">{kindLabel}</span>
                </TableCell>
                <TableCell>
                  {/* A `flag` entry's count is null: there's no path to check it against,
                      and claiming zero would read as a broken flag rather than a skipped
                      check. */}
                  {count !== undefined && count !== null && (
                    <span
                      className={cn(
                        'flex h-full items-center gap-1',
                        count === 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {count === 0 && <TriangleAlert aria-hidden="true" className="size-4" />}
                      {count === 0 ? 'No matches' : `${count} match${count === 1 ? '' : 'es'}`}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {lastCommit && (
                    <span className="text-muted-foreground flex h-full items-center gap-1">
                      <time
                        dateTime={lastCommit.date}
                        title={new Date(lastCommit.date).toLocaleString()}
                      >
                        {relativeDate(lastCommit.date)}
                      </time>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
