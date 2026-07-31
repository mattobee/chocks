import { queryOptions } from '@tanstack/react-query'
import { api } from './api'

export const queryKeys = {
  workspace: ['workspace'] as const,
  features: ['features'] as const,
  history: (id: string) => ['history', id] as const,
}

export const workspaceQuery = () =>
  queryOptions({ queryKey: queryKeys.workspace, queryFn: api.workspace, staleTime: Infinity })

export const featuresQuery = () =>
  queryOptions({ queryKey: queryKeys.features, queryFn: api.listFeatures })

export const historyQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.history(id),
    queryFn: () => api.featureHistory(id),
    enabled: id !== '',
    // Shelling out to git per view; no need to re-run it on every focus.
    staleTime: 60_000,
  })
