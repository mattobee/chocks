import { humanise } from './ids'

/**
 * Feature lifecycle statuses.
 *
 * The defaults describe *where a feature is in its life*, never how much effort is
 * currently going into it. That distinction matters: "in progress" collides with every
 * other state, because a released feature is usually still being worked on. Every default
 * here is positional — a feature is either released or it isn't — so activity belongs on
 * a separate axis, which tags already provide.
 */

export interface StatusDefinition {
  /** Value written to frontmatter. Lowercase, hyphenated. */
  id: string
  /** Shown in the UI. */
  label: string
  color: StatusColor
}

/**
 * Fixed palette.
 *
 * Class strings are written out in full rather than composed, because Tailwind scans
 * source for literals — a template-built class name would be stripped from the build.
 */
export const STATUS_COLORS = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  muted: 'bg-transparent text-muted-foreground line-through',
  /** Not selectable in config — used to render a status the config does not define. */
  unknown: 'bg-transparent text-muted-foreground border border-dashed border-current',
} as const

export type StatusColor = keyof typeof STATUS_COLORS

export const STATUS_COLOR_NAMES = Object.keys(STATUS_COLORS).filter(
  (name) => name !== 'unknown',
) as StatusColor[]

export const DEFAULT_STATUSES: StatusDefinition[] = [
  { id: 'planned', label: 'Planned', color: 'blue' },
  { id: 'pre-release', label: 'Pre-release', color: 'amber' },
  { id: 'released', label: 'Released', color: 'emerald' },
  { id: 'deprecated', label: 'Deprecated', color: 'orange' },
  { id: 'dropped', label: 'Dropped', color: 'muted' },
]

/** The status a new feature gets when none is given. */
export function defaultStatusId(statuses: StatusDefinition[]): string {
  return statuses[0]?.id ?? DEFAULT_STATUSES[0]!.id
}

export function findStatus(statuses: StatusDefinition[], id: string): StatusDefinition | undefined {
  return statuses.find((status) => status.id === id)
}

/**
 * Always returns something renderable.
 *
 * A status the config does not define is shown as-is rather than corrected, because the
 * value may come from a branch with different config, or from a file someone hand-edited.
 * Silently rewriting it would destroy their data.
 */
export function statusOrUnknown(statuses: StatusDefinition[], id: string): StatusDefinition {
  return findStatus(statuses, id) ?? { id, label: humanise(id, '(none)'), color: 'unknown' }
}

/** A status id must be slug-shaped so it is safe in frontmatter and in a URL. */
export function isValidStatusId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(value)
}
