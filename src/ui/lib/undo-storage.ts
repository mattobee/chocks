import type { UndoEntry } from './undo'

const STORAGE_KEY = 'chocks:undo'

export interface Stacks {
  undo: UndoEntry[]
  redo: UndoEntry[]
}

const KINDS = new Set(['created', 'updated', 'moved', 'deleted', 'restored'])

/**
 * Enough of a check to reject anything that is not one of ours.
 *
 * Not a full validation: the stack is written by this code and read back by it moments
 * later. What this guards against is a stale shape left by an older build, which would
 * otherwise blow up somewhere less obvious than here.
 */
function looksLikeEntry(value: unknown): value is UndoEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.label === 'string' && typeof entry.kind === 'string' && KINDS.has(entry.kind)
}

/**
 * The stack, kept in sessionStorage.
 *
 * sessionStorage rather than localStorage so it behaves the way undo should: a refresh
 * keeps it, closing the tab loses it. Nothing goes into `.chocks`, so git stays the only
 * durable record of what happened to the tree.
 */
export function readStacks(): Stacks {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { undo: [], redo: [] }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { undo: [], redo: [] }
    const { undo, redo } = parsed as Record<string, unknown>
    return {
      undo: Array.isArray(undo) ? undo.filter(looksLikeEntry) : [],
      redo: Array.isArray(redo) ? redo.filter(looksLikeEntry) : [],
    }
  } catch {
    // Private browsing, a full quota, or something that is not JSON. Starting empty is a
    // fine outcome for a convenience.
    return { undo: [], redo: [] }
  }
}

export function writeStacks(stacks: Stacks): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stacks))
  } catch {
    // As above: losing the stack is not worth failing an edit over.
  }
}
