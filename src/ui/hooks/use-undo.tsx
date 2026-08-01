import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/ui/lib/api'
import { queryKeys } from '@/ui/lib/queries'
import { StaleUndoError, type UndoEntry } from '@/ui/lib/undo'
import { UndoContext } from '@/ui/lib/undo-context'
import { describeError } from '@/lib/errors'

/** Deep enough to cover a run of edits, shallow enough that stale entries age out. */
const LIMIT = 20

/**
 * A session's worth of undo, held in memory and nowhere else.
 *
 * Nothing is written to `.chocks` and nothing survives the tab closing, which keeps git
 * as the only durable record of what happened to the tree.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  // Undo is a sequence of writes. Letting a second one start midway would interleave them.
  const running = useRef(false)

  const record = useCallback((entry: UndoEntry) => {
    setUndoStack((stack) => [...stack, entry].slice(-LIMIT))
    setRedoStack([])
  }, [])

  const apply = useCallback(
    (
      from: UndoEntry[],
      setFrom: (next: UndoEntry[]) => void,
      pushTo: (entry: UndoEntry) => void,
      verb: 'Undid' | 'Redid',
      nothingLeft: string,
    ) => {
      const entry = from[from.length - 1]
      if (!entry) {
        toast(nothingLeft)
        return
      }
      if (running.current) return
      running.current = true

      void (async () => {
        try {
          // Read the tree as it is now, not as it was when the entry was recorded. Files
          // change on disk from the user's editor at any time.
          const features = await api.listFeatures()
          for (const uid of entry.touches) {
            if (!features.some((feature) => feature.uid === uid)) {
              throw new StaleUndoError('that feature is no longer here')
            }
          }

          const opposite = await entry.undo(features)
          setFrom(from.slice(0, -1))
          pushTo(opposite)
          toast(`${verb}: ${entry.label}`)
        } catch (error) {
          // A refused entry stays on the stack. Dropping it would lose the only record of
          // what the user was trying to get back to.
          const why =
            error instanceof StaleUndoError
              ? `Can't undo ${entry.label}, ${error.message}`
              : `Could not undo ${entry.label}. ${describeError(error)}`
          toast.error(why)
        } finally {
          running.current = false
          void queryClient.invalidateQueries({ queryKey: queryKeys.features })
        }
      })()
    },
    [queryClient],
  )

  const undo = useCallback(
    () =>
      apply(
        undoStack,
        setUndoStack,
        (entry) => setRedoStack((stack) => [...stack, entry].slice(-LIMIT)),
        'Undid',
        'Nothing left to undo',
      ),
    [apply, undoStack],
  )

  const redo = useCallback(
    () =>
      apply(
        redoStack,
        setRedoStack,
        (entry) => setUndoStack((stack) => [...stack, entry].slice(-LIMIT)),
        'Redid',
        'Nothing left to redo',
      ),
    [apply, redoStack],
  )

  return (
    <UndoContext.Provider
      value={{ record, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }}
    >
      {children}
    </UndoContext.Provider>
  )
}
