import { isMarkdownName } from './paths.js'

const normalizePath = (path) => String(path || '').replace(/\\/g, '/').replace(/\/+$/, '')

// Turn the complete recursive directory snapshot into the smallest lazy-tree
// cache that can render every Markdown branch. Directories that have no
// Markdown files anywhere below them remain visible in their parent, but stay
// collapsed and unloaded.
export function selectMarkdownBranches(treeMap, rootPaths) {
  const entriesByPath = new Map()
  for (const [path, nodes] of Object.entries(treeMap || {})) {
    entriesByPath.set(normalizePath(path), { path, nodes: Array.isArray(nodes) ? nodes : [] })
  }

  const memo = new Map()
  const visiting = new Set()
  const markdownDirs = new Set()

  const containsMarkdown = (path) => {
    const normalized = normalizePath(path)
    if (memo.has(normalized)) return memo.get(normalized)
    if (visiting.has(normalized)) return false
    visiting.add(normalized)

    const entry = entriesByPath.get(normalized)
    let contains = false
    for (const node of entry?.nodes || []) {
      if (node.type === 'file' && isMarkdownName(node.name || node.path)) {
        contains = true
      } else if (node.type === 'dir' && containsMarkdown(node.path)) {
        contains = true
      }
    }

    visiting.delete(normalized)
    memo.set(normalized, contains)
    if (contains) markdownDirs.add(normalized)
    return contains
  }

  const roots = (rootPaths || []).filter(Boolean)
  roots.forEach(containsMarkdown)
  const rootSet = new Set(roots.map(normalizePath))
  const expanded = new Set(roots)
  const childrenMap = {}

  for (const [normalized, entry] of entriesByPath) {
    if (!rootSet.has(normalized) && !markdownDirs.has(normalized)) continue
    childrenMap[entry.path] = entry.nodes
    if (markdownDirs.has(normalized)) expanded.add(entry.path)
  }

  return {
    childrenMap,
    expanded,
    markdownDirectoryCount: markdownDirs.size
  }
}
