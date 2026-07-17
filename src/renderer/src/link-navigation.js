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
  const rawPath = hashIdx >= 0 ? value.slice(0, hashIdx) : value
  const path = safeDecode(rawPath)
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return null
  return {
    path,
    anchor: hashIdx >= 0 ? safeDecode(value.slice(hashIdx + 1)) : ''
  }
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
