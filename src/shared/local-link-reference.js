const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseLocalLinkReference(href) {
  const raw = String(href || '').trim()
  if (!raw || raw.length > 32_767 || raw.includes('\0')) return null
  const hashAt = raw.indexOf('#')
  const beforeHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw
  const fragment = hashAt >= 0 ? safeDecode(raw.slice(hashAt + 1)) : ''
  const queryAt = beforeHash.indexOf('?')
  const pathPart = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash
  if (!pathPart) return { kind: 'anchor', fragment }

  if (/^file:/i.test(pathPart)) {
    try {
      const parsed = new globalThis.URL(pathPart)
      if (parsed.protocol !== 'file:' || parsed.username || parsed.password || parsed.port)
        return null
      return { kind: 'file-url', uri: pathPart, fragment }
    } catch {
      return null
    }
  }
  const decoded = safeDecode(pathPart)
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || /^\\\\/.test(decoded)) {
    return { kind: 'absolute', path: decoded, fragment }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded)) return null
  if (/^\/(?!\/)/.test(decoded)) {
    return { kind: 'workspace-root', path: decoded, fragment }
  }
  return { kind: 'relative', path: decoded, fragment }
}
