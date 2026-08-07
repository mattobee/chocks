import { Code, Flag, FlaskConical } from 'lucide-react'
import type { FeatureCodeRef } from '@/lib/types'

const CODE_KIND_ICONS = new Map<string, typeof Code>([
  ['test', FlaskConical],
  ['flag', Flag],
])

/**
 * Not links: a `code` entry is a glob, not a URL, and nothing yet confirms it matches
 * anything, so it renders as plain text rather than something to click.
 */
export function FeatureCode({ code }: { code: FeatureCodeRef[] }) {
  if (code.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Code</h2>
      <ul className="flex list-none flex-col items-start gap-2 p-0">
        {code.map(({ path, kind }, index) => {
          const Icon = CODE_KIND_ICONS.get(kind ?? '') ?? Code
          return (
            <li
              key={`${path}:${index}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="font-mono">{path}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
