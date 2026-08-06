import {
  BookOpen,
  CircleDot,
  FileText,
  GitPullRequest,
  Link as LinkIcon,
  Palette,
} from 'lucide-react'
import type { FeatureLink } from '@/lib/types'

const LINK_ICONS = new Map<string, typeof BookOpen>([
  ['docs', BookOpen],
  ['issue', CircleDot],
  ['pr', GitPullRequest],
  ['design', Palette],
  ['spec', FileText],
])

const EXTERNAL_URL = /^(?:https?:)?\/\//i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function FeatureLinks({ links }: { links: FeatureLink[] }) {
  if (links.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Links</h2>
      <ul className="flex list-none flex-col items-start gap-2 p-0">
        {links.map(({ url, label, type }, index) => {
          const Icon = LINK_ICONS.get(type ?? '') ?? LinkIcon
          const external = EXTERNAL_URL.test(url)
          const path = !HAS_SCHEME.test(url)
          const className =
            'inline-flex items-center gap-1.5 rounded-md text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none'
          const content = (
            <>
              <Icon aria-hidden="true" className="size-4" />
              {label ?? url}
            </>
          )
          return (
            <li key={`${url}:${index}`}>
              {external || path ? (
                <a
                  className={className}
                  {...(external
                    ? { href: url, target: '_blank', rel: 'noreferrer' }
                    : { href: url })}
                >
                  {content}
                </a>
              ) : (
                <span className={className}>{content}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
