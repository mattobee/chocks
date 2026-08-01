import { createContext, useContext } from 'react'
import type { UndoEntry } from './undo'

export interface UndoContextValue {
  record: (entry: UndoEntry) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/** Separate from the provider so that file exports a component and nothing else. */
export const UndoContext = createContext<UndoContextValue | null>(null)

export function useUndo(): UndoContextValue {
  const value = useContext(UndoContext)
  if (!value) throw new Error('useUndo must be used inside an UndoProvider')
  return value
}
