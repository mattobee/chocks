import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError, subscribeToChanges } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { childrenOf, indexAfter } from '../../lib/tree'
import type { Feature } from '../../lib/types'

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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.features })

  const create = useMutation({
    mutationFn: (input: {
      parent: string
      title: string
      status?: string
      tags?: string[]
      description?: string
    }) => api.createFeature(input),
    onSuccess: invalidate,
    onError: (error) => toast.error(message(error, 'Could not create feature')),
  })

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Parameters<typeof api.updateFeature>[1]) =>
      api.updateFeature(id, patch),
    onSuccess: invalidate,
    onError: (error) => toast.error(message(error, 'Could not save feature')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFeature(id),
    onSuccess: invalidate,
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
    onSuccess: invalidate,
    onError: (error) => toast.error(message(error, 'Could not move feature')),
  })

  return { create, update, remove, move }
}
