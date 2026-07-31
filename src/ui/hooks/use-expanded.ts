import { useCallback, useState } from 'react'

const STORAGE_KEY = 'chocks:expanded'

/** Expansion state, persisted so a reload does not collapse the tree. */
export function useExpanded() {
  const [expanded, setExpandedState] = useState<Set<string>>(read)

  const persist = useCallback((next: Set<string>) => {
    setExpandedState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // Private browsing or a full quota — not worth failing over.
    }
  }, [])

  const toggle = useCallback((id: string) => {
    setExpandedState((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // ignored, see above
      }
      return next
    })
  }, [])

  return { expanded, toggle, setExpanded: persist }
}

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}
