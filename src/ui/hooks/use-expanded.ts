import { useCallback, useState } from 'react'

const STORAGE_KEY = 'chocks:expanded'

/** Expansion state, persisted so a reload does not collapse the tree. */
export function useExpanded() {
  const [expanded, setExpandedState] = useState<Set<string>>(read)

  const persist = useCallback((next: Set<string>) => {
    setExpandedState(next)
    save(next)
  }, [])

  const toggle = useCallback((id: string) => {
    setExpandedState((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save(next)
      return next
    })
  }, [])

  return { expanded, toggle, setExpanded: persist }
}

function save(expanded: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]))
  } catch {
    // Private browsing or a full quota — not worth failing over.
  }
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
