import { isMarkdownName } from './paths.js'

const normalizePath = (path) => String(path || '').replace(/\\/g, '/').replace(/\/+$/, '')

// Read a group of lazy-tree directories without issuing an unbounded burst of
// IPC calls. Results keep the caller's first-seen order; duplicate paths and
// individual read failures are omitted so one inaccessible folder cannot block
// the rest of the tree refresh.
export async function readDirectoriesBatched(directories, readDirectory, concurrency = 6) {
  const dirs = [...new Set((directories || []).filter(Boolean))]
  if (!dirs.length) return []

  const requestedLimit = Number(concurrency)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.floor(requestedLimit))
    : 1
  const results = new Array(dirs.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < dirs.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        const nodes = await readDirectory(dirs[index])
        results[index] = [dirs[index], Array.isArray(nodes) ? nodes : []]
      } catch {
        // Keep refreshing the remaining directories. Watcher reads can race
        // with folder deletion or permissions changing underneath the app.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, dirs.length) }, () => worker())
  )
  return results.filter(Boolean)
}

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

// Flatten only the currently-visible part of the lazy tree. This is the source
// of truth for roving focus and ArrowUp/ArrowDown keyboard navigation.
export function flattenVisibleTree(workspaces, childrenMap, expanded) {
  const rows = []
  const open = expanded instanceof Set ? expanded : new Set(expanded || [])
  const children = childrenMap || {}

  const appendChildren = (parentPath, depth) => {
    for (const node of children[parentPath] || []) {
      rows.push({
        path: node.path,
        name: node.name,
        type: node.type,
        isRoot: false,
        parentPath,
        depth
      })
      if (node.type === 'dir' && open.has(node.path)) {
        appendChildren(node.path, depth + 1)
      }
    }
  }

  for (const workspace of workspaces || []) {
    if (!workspace?.rootPath) continue
    rows.push({
      path: workspace.rootPath,
      name: workspace.rootName || workspace.rootPath,
      type: 'dir',
      isRoot: true,
      parentPath: null,
      depth: 0
    })
    if (open.has(workspace.rootPath)) appendChildren(workspace.rootPath, 1)
  }

  return rows
}
