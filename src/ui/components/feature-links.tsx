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

export function FeatureLinks({ links }: { links: FeatureLink[] }) {
  if (links.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Links</h2>
      <ul className="flex list-none flex-col items-start gap-2 p-0">
        {links.map(({ url, label, type }, index) => {
          const Icon = LINK_ICONS.get(type ?? '') ?? LinkIcon
          const external = EXTERNAL_URL.test(url)
          const linkClassName =
            'inline-flex items-center gap-1.5 rounded-md text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none'
          const textClassName = 'inline-flex items-center gap-1.5 text-sm'
          const icon = <Icon aria-hidden="true" className="size-4" />
          const linkContent = (
            <>
              {icon}
              {label ?? url}
            </>
          )
          return (
            <li key={`${url}:${index}`}>
              {external ? (
                <a className={linkClassName} href={url} target="_blank" rel="noreferrer">
                  {linkContent}
                </a>
              ) : (
                <span className={textClassName}>
                  {icon}
                  {label && <span>{label}</span>}
                  <span className="font-mono text-muted-foreground">{url}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
