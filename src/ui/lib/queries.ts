import { queryOptions } from '@tanstack/react-query'
import { api } from './api'

export const queryKeys = {
  workspace: ['workspace'] as const,
  features: ['features'] as const,
  history: (id: string) => ['history', id] as const,
  codeMatches: (id: string) => ['codeMatches', id] as const,
  uncommitted: ['uncommitted'] as const,
}

export const workspaceQuery = () =>
  queryOptions({ queryKey: queryKeys.workspace, queryFn: api.workspace, staleTime: Infinity })

export const featuresQuery = () =>
  queryOptions({ queryKey: queryKeys.features, queryFn: api.listFeatures })

export const uncommittedQuery = () =>
  queryOptions({
    queryKey: queryKeys.uncommitted,
    queryFn: api.uncommitted,
    // Shelling out to git; the file/git watchers push a refetch when it can have changed.
    staleTime: 60_000,
  })

export const historyQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.history(id),
    queryFn: () => api.featureHistory(id),
    enabled: id !== '',
    // Shelling out to git per view; no need to re-run it on every focus.
    staleTime: 60_000,
  })

export const codeMatchesQuery = (id: string, enabled: boolean) =>
  queryOptions({
    queryKey: queryKeys.codeMatches(id),
    queryFn: () => api.codeMatches(id),
    enabled: id !== '' && enabled,
    // Walks the repo per view; no need to re-run it on every focus.
    staleTime: 60_000,
  })
