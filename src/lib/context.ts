import { buildTree, type TreeNode } from './tree'
import type { Feature } from './types'

export interface ContextEntry {
  path: string
  title: string
  status: string
  tags: string[]
  description: string
}

export function formatContext(features: Feature[]): string {
  function lines(nodes: TreeNode[]): string[] {
    return nodes.flatMap(({ feature, children }) => [
      JSON.stringify({
        path: feature.id,
        title: feature.title,
        status: feature.status,
        tags: feature.tags,
        description: feature.description.split(/\r?\n\s*\r?\n/, 1)[0] ?? '',
      } satisfies ContextEntry),
      ...lines(children),
    ])
  }

  return lines(buildTree(features)).join('\n')
}
