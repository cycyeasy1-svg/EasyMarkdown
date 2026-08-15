function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseInternalDocLink(href) {
  const value = String(href || '').trim()
  if (!value || /^(https?:|mailto:)/i.test(value)) return null
  const hashIdx = value.indexOf('#')
  const beforeHash = hashIdx >= 0 ? value.slice(0, hashIdx) : value
  const queryIdx = beforeHash.indexOf('?')
  const rawPath = queryIdx >= 0 ? beforeHash.slice(0, queryIdx) : beforeHash
  let path = safeDecode(rawPath)
  if (/^file:/i.test(rawPath)) {
    try {
      const parsed = new URL(rawPath)
      const pathname = safeDecode(parsed.pathname || '')
      path =
        parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost'
          ? `\\\\${parsed.hostname}\\${pathname.replace(/^\/+/, '').replaceAll('/', '\\')}`
          : /^\/[a-zA-Z]:\//.test(pathname)
            ? pathname.slice(1)
            : pathname
    } catch {
      return null
    }
  } else if (!/^[a-zA-Z]:[\\/]/.test(path) && /^[a-z][a-z\d+.-]*:/i.test(path)) {
    return null
  }
  return {
    path,
    anchor: hashIdx >= 0 ? safeDecode(value.slice(hashIdx + 1)) : ''
  }
}

export function isMarkdownDocumentLink(href) {
  const parsed = parseInternalDocLink(href)
  if (!parsed) return false
  if (!parsed.path) return true
  const fileName = parsed.path.replace(/\\/g, '/').split('/').pop() || ''
  return !/\.[a-z0-9]+$/i.test(fileName) || /\.(md|markdown|mdx)$/i.test(fileName)
}

export function internalLinkTarget(href, fromPath = '') {
  const parsed = parseInternalDocLink(href)
  if (!parsed) return null
  const targetPath = (parsed.path || fromPath).replace(/\\/g, '/')
  const fileName = targetPath.split('/').filter(Boolean).pop() || ''
  return {
    ...parsed,
    fileName,
    label: [fileName, parsed.anchor ? `#${parsed.anchor}` : ''].filter(Boolean).join(' › ')
  }
}
