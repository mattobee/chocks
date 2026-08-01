import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError, subscribeToChanges } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { childrenOf, indexAfter } from '../../lib/tree'
import type { Feature } from '../../lib/types'
import { useUndo } from '../lib/undo-context'
import { createdEntry, deletedEntry, movedEntry, subtreeSnapshot, updatedEntry } from '../lib/undo'

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback
}

/**
 * Keeps the open UI in step with the repo.
 *
 * A feature write changes the tree and also its git status, so both are refetched. A git
 * event leaves the files alone but changes their history, which is what makes the
 * "uncommitted changes" indicator clear itself the moment you commit.
 */
export function useWatchFiles(): void {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      subscribeToChanges((event) => {
        if (event === 'changed') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.features })
        }
        void queryClient.invalidateQueries({ queryKey: ['history'] })
      }),
    [queryClient],
  )
}

export function useFeatureMutations(features: Feature[]) {
  const queryClient = useQueryClient()
  const { record } = useUndo()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.features })

  /** The state to put back, captured before the write destroys it. */
  const before = (id: string) => features.find((feature) => feature.id === id)

  const create = useMutation({
    mutationFn: (input: {
      parent: string
      title: string
      status?: string
      tags?: string[]
      description?: string
    }) => api.createFeature(input),
    onSuccess: (created) => {
      record(createdEntry(created))
      return invalidate()
    },
    onError: (error) => toast.error(message(error, 'Could not create feature')),
  })

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Parameters<typeof api.updateFeature>[1]) =>
      api.updateFeature(id, patch),
    // Captured before the request goes out, not after it returns. The file watcher pushes
    // a refetch the moment the write lands, so by `onSuccess` the list this hook closed
    // over can already be the new one, and the entry would record the state we just left
    // as the state to go back to.
    onMutate: (variables) => ({ previous: before(variables.id), features }),
    onSuccess: (_updated, variables, context) => {
      // A bare sort change is a reorder the move mutation already recorded, so recording
      // it again would need two undos to put one drag back.
      const changesMoreThanOrder = Object.keys(variables).some(
        (key) => key !== 'id' && key !== 'sort',
      )
      if (context.previous && changesMoreThanOrder) {
        record(updatedEntry(context.previous, context.features))
      }
      return invalidate()
    },
    onError: (error) => toast.error(message(error, 'Could not save feature')),
  })

  const remove = useMutation({
    // Captured in mutationFn rather than onSuccess: by the time the delete returns, the
    // subtree is gone from disk and the store returns nothing about what it removed.
    mutationFn: async (id: string) => {
      const doomed = before(id)
      const captured = doomed ? subtreeSnapshot(features, doomed) : []
      await api.deleteFeature(id)
      return captured
    },
    onSuccess: (captured) => {
      if (captured.length > 0) record(deletedEntry(captured))
      return invalidate()
    },
    onError: (error) => toast.error(message(error, 'Could not delete feature')),
  })

  const move = useMutation({
    mutationFn: ({
      id,
      newParent,
      afterId,
    }: {
      id: string
      newParent: string
      afterId: string | null
    }) => {
      const siblings = childrenOf(features, newParent).filter((feature) => feature.id !== id)
      return api.moveFeature(id, { newParent, index: indexAfter(siblings, afterId) })
    },
    // Before the request, for the same reason as update above.
    onMutate: (variables) => ({ previous: before(variables.id), features }),
    onSuccess: (_moved, _variables, context) => {
      if (context.previous) record(movedEntry(context.previous, context.features))
      return invalidate()
    },
    onError: (error) => toast.error(message(error, 'Could not move feature')),
  })

  return { create, update, remove, move }
}
