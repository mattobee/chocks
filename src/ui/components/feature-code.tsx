import { useQuery } from '@tanstack/react-query'
import { Code, Flag, FlaskConical, TriangleAlert } from 'lucide-react'
import { Badge } from '@/ui/components/ui/badge'
import { codeMatchesQuery } from '@/ui/lib/queries'
import type { FeatureCodeRef } from '@/lib/types'

const CODE_KIND_ICONS = new Map<string, typeof Code>([
  ['test', FlaskConical],
  ['flag', Flag],
])

/**
 * Not links: a `code` entry is a glob, not a URL, so it renders as plain text rather than
 * something to click.
 */
export function FeatureCode({ featureId, code }: { featureId: string; code: FeatureCodeRef[] }) {
  const matches = useQuery(codeMatchesQuery(featureId, code.length > 0))

  if (code.length === 0) return null

  // Matched by position against the feature's own `code`, which is the order this list is
  // rendered in. A mismatched length (a stale response, or one still loading) just means no
  // badge yet for the entries past it, rather than a wrong one.
  const counts = matches.data?.matches

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Code</h2>
      <ul className="flex list-none flex-col items-start gap-2 p-0">
        {code.map(({ path, kind }, index) => {
          const Icon = CODE_KIND_ICONS.get(kind ?? '') ?? Code
          const count = counts?.[index]?.count
          return (
            <li
              key={`${path}:${index}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="font-mono">{path}</span>
              {/* A `flag` entry's count is null: there's no path to check it against, and
                  a badge claiming zero would read as a broken flag rather than a skipped
                  check. */}
              {count !== undefined && count !== null && (
                <Badge variant={count === 0 ? 'destructive' : 'outline'}>
                  {count === 0 && <TriangleAlert aria-hidden="true" />}
                  {count === 0 ? 'No matches' : `${count} match${count === 1 ? '' : 'es'}`}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
