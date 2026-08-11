const normalizePathPart = (value) =>
  String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '')

export function buildLiteStatusPath(tab, workspace, separator = '\\') {
  if (!tab) return ''
  const relativePath = normalizePathPart(tab.relativePath)
  if (relativePath && tab.workspaceId && tab.workspaceId === workspace?.id) {
    const rootName = normalizePathPart(workspace.name || workspace.handle?.name)
    const path = rootName ? `${rootName}/${relativePath}` : relativePath
    return path.replaceAll('/', separator)
  }
  return (relativePath || String(tab.name || '')).replaceAll('/', separator)
}

export function isLiteDocumentDirty(tab, sourcePanel) {
  if (!tab) return false
  if (tab.content !== tab.savedContent) return true
  return (
    sourcePanel?.tabId === tab.id &&
    String(sourcePanel.draft ?? '') !== String(sourcePanel.original ?? '')
  )
}
