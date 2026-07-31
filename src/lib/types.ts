import type { StatusDefinition } from './status'

/**
 * A single feature — one markdown file on disk.
 *
 * There is deliberately no stored `parent`: `id` is the file's path relative to the chocks
 * directory (`auth/oauth/github`), so the parent is just its dirname. The hierarchy cannot
 * disagree with the filesystem, and a cycle is unrepresentable.
 */
export interface Feature {
  /** Path-derived identity, e.g. `auth/oauth/github`. Changes when moved or retitled. */
  id: string
  /**
   * Short random string from frontmatter that never changes, so URLs survive a move.
   * Empty only for a hand-written file that has not been backfilled yet.
   */
  uid: string
  /** Derived from `id`; empty string for a top-level feature. */
  parent: string
  title: string
  /** Markdown body of the file. */
  description: string
  /**
   * Status id. A plain string rather than a union, because the list is configurable and a
   * value the current config does not define must survive rather than be corrected.
   */
  status: string
  /** Free-form labels from frontmatter — no separate tag records to keep in sync. */
  tags: string[]
  /** Fractional index key ordering this feature among its siblings. */
  sort: string
}

/** Project-level settings, read from `.chocks/config.yaml`. */
export interface ChocksConfig {
  statuses: StatusDefinition[]
}

/** Describes the checkout the server is pointed at. */
export interface Workspace {
  /** Absolute path of the chocks directory being served. */
  root: string
  /** Name to show in the UI, taken from the repo directory. */
  name: string
  config: ChocksConfig
}
