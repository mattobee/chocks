import { buildTree, type TreeNode } from './tree'
import type { Feature, FeatureCodeRef, FeatureLink } from './types'

export interface ContextEntry {
  path: string
  title: string
  status: string
  tags: string[]
  links: FeatureLink[]
  code: FeatureCodeRef[]
  summary: string
}

export function formatContext(features: Feature[]): string {
  function lines(nodes: TreeNode[]): string[] {
    return nodes.flatMap(({ feature, children }) => [
      JSON.stringify({
        path: feature.id,
        title: feature.title,
        status: feature.status,
        tags: feature.tags,
        links: feature.links,
        code: feature.code,
        summary: feature.description.split(/\r?\n\s*\r?\n/, 1)[0] ?? '',
      } satisfies ContextEntry),
      ...lines(children),
    ])
  }

  return lines(buildTree(features)).join('\n')
}
