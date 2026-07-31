import { queryOptions } from '@tanstack/react-query'
import { api } from './api'

export const queryKeys = {
  workspace: ['workspace'] as const,
  features: ['features'] as const,
}

export const workspaceQuery = () =>
  queryOptions({ queryKey: queryKeys.workspace, queryFn: api.workspace, staleTime: Infinity })

export const featuresQuery = () =>
  queryOptions({ queryKey: queryKeys.features, queryFn: api.listFeatures })
