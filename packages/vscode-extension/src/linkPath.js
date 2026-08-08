function parseWorkspaceRootLink(value) {
  const raw = String(value || '').replace(/\\/g, '/')
  if (!/^\/(?!\/)/.test(raw)) return null
  const segments = []
  for (const segment of raw.slice(1).split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return { valid: false, segments: [] }
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return { valid: true, segments }
}

module.exports = { parseWorkspaceRootLink }
