// Resolve relative image paths in a document against the file's folder, as
// display-only file:// URLs (the document model keeps the original relative src).

export function dirOf(path) {
  if (!path) return null
  const norm = path.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(0, i) : null
}

// A src is "relative" if it has no scheme (http:, data:, file:…), is not a
// protocol-relative URL, and is not an absolute filesystem path.
export function isRelativePath(src) {
  if (!src) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false // http:, data:, file:, C: …
  if (src.startsWith('//')) return false
  if (src.startsWith('/')) return false
  return true
}

export function resolveToFileUrl(baseDir, src) {
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const isWin = /^[a-zA-Z]:/.test(base)
  const segs = base.split('/')
  for (const part of src.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segs.pop()
    else segs.push(part)
  }
  const joined = segs.join('/')
  const url = isWin ? 'file:///' + joined : 'file://' + (joined.startsWith('/') ? joined : '/' + joined)
  // encodeURI escapes a literal `%` to `%25`, so a src that already carries a valid
  // escape — `assets/a%20b.png`, the spec-compliant way to write a space — came out
  // as `%2520` and 404'd. Collapse those back. A lone `%` not followed by two hex
  // digits (a file literally named `100%.png`) has no `%25XX` to match, so it stays
  // escaped, which is what we want.
  return encodeURI(url).replace(/%25([0-9A-Fa-f]{2})/g, '%$1')
}
