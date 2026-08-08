import type { StatusDefinition } from './status'

export const MAX_TITLE_LENGTH = 300
export const MAX_TAG_LENGTH = 50
export const MAX_TAG_COUNT = 100
export const MAX_LINK_COUNT = 20
export const MAX_CODE_COUNT = 20
export const MAX_DESCRIPTION_LENGTH = 10_000

export interface FeatureLink {
  url: string
  label?: string
  type?: string
}

/** What a `code` entry claims about a path: implementation, a test for it, or a flag key. */
export type CodeKind = 'code' | 'test' | 'flag'

/** Declared importance. `normal` explicitly stops inheritance from an ancestor. */
export type Importance = 'high' | 'normal' | 'low'

/**
 * A claim about where a feature lives in the repo, distinct from `links`.
 *
 * A link is somewhere to click; this is what a future `chocks audit` would check: a glob
 * that should match something, and whether it changed since last confirmed.
 */
export interface FeatureCodeRef {
  /** Repo-relative glob. */
  path: string
  /** Defaults to `code` when absent. */
  kind?: CodeKind
}

/** How many files a `code` entry's glob matched, read fresh from disk. */
export interface CodeMatch {
  path: string
  /** Null for a `flag` entry: there's no path to check it against. */
  count: number | null
  /** Most recent commit touching a matched file. Null with no match, or git unavailable. */
  lastCommit: Commit | null
}

/** What `/api/code/:id` returns. */
export interface FeatureCodeMatches {
  matches: CodeMatch[]
}

/**
 * A single feature — one markdown file on disk.
 *
 * Nothing here records the hierarchy: `id` is the file's path relative to the chocks
 * directory (`auth/oauth/github`), and `parent` below is derived from it rather than
 * stored. That is why the tree can never disagree with the filesystem, and why a cycle is
 * unrepresentable.
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
  /** Declared value. Omitted to inherit from the nearest ancestor. */
  importance?: Importance
  /** Free-form labels from frontmatter — no separate tag records to keep in sync. */
  tags: string[]
  /** Ordered links from frontmatter. Read-only in the UI. */
  links: FeatureLink[]
  /**
   * Ordered code/test/flag claims from frontmatter. Read-only in the UI. Whether a `path`
   * currently matches anything is checked separately, by `/api/code/:id`, rather than here.
   */
  code: FeatureCodeRef[]
  /** Fractional index key ordering this feature among its siblings. */
  sort: string
}

/** Project-level settings, read from `.chocks/config.yaml`. */
export interface ChocksConfig {
  statuses: StatusDefinition[]
}

/** One commit touching a feature's file. */
export interface Commit {
  sha: string
  shortSha: string
  author: string
  /** ISO 8601. */
  date: string
  subject: string
}

export interface HistoryCommit extends Commit {
  event: 'created' | 'updated'
  /** Earliest tag containing this commit, by tag creation date. */
  release?: string
  statusChange?: {
    from?: string
    to?: string
  }
  /** Web URL when the repository remote can be mapped to a forge. */
  url?: string
}

export type HistoryUnavailable = 'not-a-repo' | 'git-missing' | 'failed'

/** What `/api/history/:id` returns — chocks has no revision model beyond the repo. */
export interface FeatureHistory {
  commits: HistoryCommit[]
  /** Set when history could not be read at all; `commits` is then empty. */
  unavailable?: HistoryUnavailable
  /** True when the file has changes that are not committed yet. */
  uncommitted: boolean
}

/** Describes the checkout the server is pointed at. */
export interface Workspace {
  /** Absolute path of the chocks directory being served. */
  root: string
  /** Name to show in the UI, taken from the repo directory. */
  name: string
  /**
   * Version of chocks doing the serving. Comes from the server rather than the bundle so
   * it reports what is actually running, which is what you want when someone says the app
   * is misbehaving. Empty if it could not be read.
   */
  version: string
  /** Release notes for that version. Empty when the version or the repo is unknown. */
  releaseUrl: string
  config: ChocksConfig
}

/** What `/api/uncommitted` returns: ids of features with changes not yet committed. */
export interface UncommittedFeatures {
  ids: string[]
}
