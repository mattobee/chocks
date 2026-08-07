import { MAX_CODE_COUNT, type CodeKind, type FeatureCodeRef } from './types'

const CODE_KINDS: readonly CodeKind[] = ['code', 'test', 'flag']

export function normaliseCode(value: unknown, limit = MAX_CODE_COUNT): FeatureCodeRef[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, limit).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []

    const data = entry as Record<string, unknown>
    const path = typeof data.path === 'string' ? data.path.trim() : ''
    if (path === '') return []

    // Unlike a link's `type`, an unrecognised kind is corrected rather than kept: there is
    // nothing to render it as, and the field means only three things.
    const kind = typeof data.kind === 'string' ? data.kind.trim() : ''
    return [
      {
        path,
        ...(CODE_KINDS.includes(kind as CodeKind) && kind !== 'code'
          ? { kind: kind as CodeKind }
          : {}),
      },
    ]
  })
}
