/**
 * Feature identity.
 *
 * A feature has two identities, and the distinction matters:
 *
 * - `id` is its path (`auth/oauth/github`). It expresses the hierarchy, makes cycles
 *   unrepresentable, and changes whenever the feature is moved or retitled.
 * - `uid` is a short random string stored in frontmatter. It never changes, so links and
 *   open tabs survive a move.
 *
 * URLs use `<slug>-<uid>`: readable enough to tell what a pasted link points at, resolved
 * by the part that cannot go stale.
 */

/**
 * Filename suffix marking a file as a feature.
 *
 * Without it every `.md` under the chocks directory is a feature, so dropping a README in
 * there to explain the directory silently creates a phantom one. Borrowed from Storybook's
 * `.stories.tsx`, and it keeps open the option of features living beside source files. Not
 * `.feature.md`: that is Cucumber's Markdown with Gherkin spec, and a repo doing BDD would
 * have two meanings for one extension.
 */
export const FEATURE_SUFFIX = '.chocks.md'

/** The parent id of a feature id — its dirname, or '' at the top level. */
export function parentOf(id: string): string {
  const index = id.lastIndexOf('/')
  return index === -1 ? '' : id.slice(0, index)
}

/** The final path segment of a feature id. */
export function slugOf(id: string): string {
  const index = id.lastIndexOf('/')
  return index === -1 ? id : id.slice(index + 1)
}

/** Joins a parent id and slug into a feature id. */
export function joinId(parent: string, slug: string): string {
  return parent === '' ? slug : `${parent}/${slug}`
}

/** Turns a title into a filename-safe slug. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug === '' ? 'feature' : slug
}

/**
 * The rough inverse of `slugify`: `oauth-providers` -> `Oauth providers`.
 *
 * Used wherever a slug has to stand in for a label nobody wrote — a file with no title in
 * its frontmatter, a status the config does not define. `fallback` covers a slug made of
 * nothing but separators, which would otherwise humanise to an empty string.
 */
export function humanise(slug: string, fallback = slug): string {
  const spaced = slug.replace(/[-_]+/g, ' ').trim()
  return spaced === '' ? fallback : spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * True when an id is safe to turn into a path inside the chocks directory.
 *
 * The id arrives from HTTP requests and is used to build a filesystem path, so this is a
 * security boundary, not a tidiness check: it must reject anything that could escape the
 * root, including `..` segments, absolute paths and Windows drive letters.
 */
export function isValidId(id: string): boolean {
  if (id === '' || id.length > 400) return false
  if (id.startsWith('/') || id.startsWith('\\')) return false
  if (/^[a-zA-Z]:/.test(id)) return false
  if (id.includes('\0') || id.includes('\\')) return false
  return id
    .split('/')
    .every((segment) => /^[a-z0-9][a-z0-9._-]*$/.test(segment) && segment !== '..')
}

/**
 * Separates the slug from the uid in a URL key.
 *
 * A hyphen would be ambiguous — `oauth-providers` is a perfectly good slug whose last
 * segment also looks like a uid. `slugify` can only ever emit `[a-z0-9-]` and `isValidId`
 * only allows `[a-z0-9._-]`, so a tilde cannot occur in a slug and the split is exact
 * rather than a guess.
 */
export const KEY_SEPARATOR = '~'

/**
 * Ten hex characters starting with a letter, as minted by `generateUid`.
 *
 * The leading letter keeps the value out of YAML's number syntax, so it is always written
 * unquoted and always parses back as a string.
 */
export const UID_PATTERN = /^[a-f][0-9a-f]{9}$/

export function isValidUid(value: unknown): value is string {
  return typeof value === 'string' && UID_PATTERN.test(value)
}

/** The URL key for a feature: its slug for humans, its uid for resolution. */
export function featureKey(feature: { id: string; uid: string }): string {
  const slug = slugOf(feature.id)
  return feature.uid === '' ? slug : `${slug}${KEY_SEPARATOR}${feature.uid}`
}

/**
 * Pulls the uid back out of a URL key.
 *
 * Returns null when the key carries no usable uid — a hand-typed URL, or a link written
 * before the feature had one — so the caller can fall back to resolving by path.
 */
export function uidFromKey(key: string): string | null {
  const index = key.lastIndexOf(KEY_SEPARATOR)
  if (index === -1) return null
  const candidate = key.slice(index + 1)
  return isValidUid(candidate) ? candidate : null
}

/** The slug half of a URL key, used to resolve links that carry no uid. */
export function slugFromKey(key: string): string {
  const index = key.lastIndexOf(KEY_SEPARATOR)
  return index === -1 ? key : key.slice(0, index)
}
