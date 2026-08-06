import { MAX_LINK_COUNT, type FeatureLink } from './types'

export function normaliseLinks(value: unknown, limit = MAX_LINK_COUNT): FeatureLink[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, limit).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []

    const data = entry as Record<string, unknown>
    const url = typeof data.url === 'string' ? data.url.trim() : ''
    if (url === '') return []

    const label = typeof data.label === 'string' ? data.label.trim() : ''
    const type = typeof data.type === 'string' ? data.type.trim() : ''
    return [
      {
        ...(label !== '' ? { label } : {}),
        url,
        ...(type !== '' ? { type } : {}),
      },
    ]
  })
}
