import { BookOpen, CircleDot, FileText, Palette } from 'lucide-react'
import { humanise } from '@/lib/ids'

/**
 * Read-only row of a feature's named links.
 *
 * Keys are free-form, but the four known ones carry an icon and a fixed display order, and
 * anything else renders with its key humanised, the same way an unknown status survives.
 * A value with an http(s) scheme is a URL opened in a new tab; one without a scheme is a
 * repo-relative path linked in place. Both render without checking the value exists.
 */
const KNOWN_LINK_KEYS = ['docs', 'issue', 'design', 'spec'] as const
const KNOWN_LINK_KEY_SET = new Set<string>(KNOWN_LINK_KEYS)

const LINK_META: Record<
  (typeof KNOWN_LINK_KEYS)[number],
  { label: string; Icon: typeof BookOpen }
> = {
  docs: { label: 'Docs', Icon: BookOpen },
  issue: { label: 'Issue', Icon: CircleDot },
  design: { label: 'Design', Icon: Palette },
  spec: { label: 'Spec', Icon: FileText },
}

/** `https://…` is external; anything with a different scheme is not safe to open. */
const EXTERNAL_URL = /^https?:\/\//i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function FeatureLinks({ links }: { links: Record<string, string> }) {
  const entries = Object.entries(links)
  const ordered = [
    ...KNOWN_LINK_KEYS.filter((key) => key in links).map((key) => [key, links[key]!] as const),
    ...entries.filter(([key]) => !KNOWN_LINK_KEY_SET.has(key)),
  ]

  if (ordered.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {ordered.map(([key, value]) => {
        const known = key in LINK_META
        const { label, Icon } = known
          ? LINK_META[key as (typeof KNOWN_LINK_KEYS)[number]]
          : { label: humanise(key), Icon: null }
        const external = EXTERNAL_URL.test(value)
        const path = !HAS_SCHEME.test(value)
        const className =
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none'
        const content = (
          <>
            {Icon && <Icon aria-hidden="true" className="size-4" />}
            {label}
          </>
        )
        // A scheme that is neither a URL we want to open nor a path is left as text, so an
        // odd frontmatter value cannot become a `javascript:` link.
        return external || path ? (
          <a
            key={key}
            className={className}
            {...(external ? { href: value, target: '_blank', rel: 'noreferrer' } : { href: value })}
          >
            {content}
          </a>
        ) : (
          <span key={key} className={className}>
            {content}
          </span>
        )
      })}
    </div>
  )
}
