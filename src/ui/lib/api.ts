import type { Feature, Workspace } from '../../lib/types'

/**
 * Client for the local chocks server.
 *
 * Same origin always: the server serves this bundle, and in dev Vite proxies /api to it.
 * There is no auth — the access control is having the repo checked out.
 */

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Non-JSON error body; the status line will do.
    }
    throw new ApiError(message, response.status)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/** Feature ids are paths, so each segment needs encoding but the slashes must survive. */
function encodeId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/')
}

export const api = {
  workspace: () => request<Workspace>('/api/workspace'),

  listFeatures: () => request<Feature[]>('/api/features'),

  createFeature: (input: {
    parent: string
    title: string
    status?: string
    tags?: string[]
    description?: string
  }) => request<Feature>('/api/features', { method: 'POST', body: JSON.stringify(input) }),

  updateFeature: (
    id: string,
    patch: {
      title?: string
      status?: string
      tags?: string[]
      description?: string
      sort?: string
    },
  ) =>
    request<Feature>(`/api/features/${encodeId(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  /**
   * Reparents or reorders. Every descendant id changes, because ids are paths — callers
   * must refetch the list rather than patch it in place.
   */
  moveFeature: (id: string, input: { newParent: string; index: number }) =>
    request<Feature>(`/api/features/${encodeId(id)}/move`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteFeature: (id: string) =>
    request<void>(`/api/features/${encodeId(id)}`, { method: 'DELETE' }),
}

/**
 * Subscribes to file changes on disk.
 *
 * This is what makes editing a feature file in your editor show up in the open UI.
 * Returns an unsubscribe function.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  const source = new EventSource('/api/events')
  source.onmessage = (event) => {
    if (event.data === 'changed') onChange()
  }
  // EventSource reconnects on its own; swallow the error so it isn't logged on every retry.
  source.onerror = () => {}
  return () => source.close()
}
