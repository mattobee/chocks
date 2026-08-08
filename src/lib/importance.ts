import type { Feature, Importance } from './types'

export interface EffectiveImportance {
  value: Importance
  /** Feature declaring the effective value. Null for the undeclared root default. */
  source: Feature | null
}

/** Resolves a declaration through ancestors ordered outermost first. */
export function effectiveImportance(
  feature: Feature,
  ancestors: readonly Feature[],
): EffectiveImportance {
  if (feature.importance !== undefined) return { value: feature.importance, source: feature }

  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index]!
    if (ancestor.importance !== undefined) {
      return { value: ancestor.importance, source: ancestor }
    }
  }

  return { value: 'normal', source: null }
}
