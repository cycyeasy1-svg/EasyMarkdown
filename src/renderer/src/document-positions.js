export const DOCUMENT_POSITIONS_KEY = 'easymarkdown.document-positions.v1'
export const DOCUMENT_POSITIONS_VERSION = 1
export const MAX_DOCUMENT_POSITIONS = 200

const isFiniteOffset = (value) => Number.isFinite(value) && value >= 0

export function normalizeDocumentPositionPath(path) {
  const value = String(path || '')
    .trim()
    .replace(/\\/g, '/')
  if (!value) return ''
  return /^[a-z]:\//i.test(value) || value.startsWith('//') ? value.toLowerCase() : value
}

// FNV-1a over the full Markdown source. The store never keeps document text;
// the fingerprint only prevents a stale caret from being applied to new content.
export function documentContentFingerprint(content) {
  const value = String(content ?? '')
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const path = normalizeDocumentPositionPath(entry.path)
  if (!path || path.length > 32_767 || path.includes('\0')) return null
  if (typeof entry.fingerprint !== 'string' || entry.fingerprint.length > 80) return null
  const caret = isFiniteOffset(entry.caret) ? Math.floor(entry.caret) : null
  const viewport = isFiniteOffset(entry.viewport) ? Math.floor(entry.viewport) : null
  if (caret == null && viewport == null) return null
  const updatedAt =
    Number.isFinite(entry.updatedAt) && entry.updatedAt > 0 ? Math.floor(entry.updatedAt) : 0
  return { path, fingerprint: entry.fingerprint, caret, viewport, updatedAt }
}

export function parseDocumentPositionStore(raw, maxEntries = MAX_DOCUMENT_POSITIONS) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || value.version !== DOCUMENT_POSITIONS_VERSION || !Array.isArray(value.entries)) {
      return []
    }
    const unique = new Map()
    for (const rawEntry of value.entries.slice(0, Math.max(0, maxEntries * 2))) {
      const entry = validEntry(rawEntry)
      if (!entry || unique.has(entry.path)) continue
      unique.set(entry.path, entry)
      if (unique.size >= maxEntries) break
    }
    return [...unique.values()].sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}

export function readDocumentPosition(storage, path, content) {
  if (!storage) return null
  const key = normalizeDocumentPositionPath(path)
  if (!key) return null
  let entries
  try {
    entries = parseDocumentPositionStore(storage.getItem(DOCUMENT_POSITIONS_KEY))
  } catch {
    return null
  }
  const entry = entries.find((candidate) => candidate.path === key)
  if (!entry || entry.fingerprint !== documentContentFingerprint(content)) return null
  const length = String(content ?? '').length
  return {
    caret: entry.caret == null ? null : Math.min(entry.caret, length),
    viewport: entry.viewport == null ? null : Math.min(entry.viewport, length),
    updatedAt: entry.updatedAt
  }
}

export function writeDocumentPosition(
  storage,
  { path, content, caret = null, viewport = null, updatedAt = Date.now() },
  maxEntries = MAX_DOCUMENT_POSITIONS
) {
  if (!storage) return false
  const entry = validEntry({
    path,
    fingerprint: documentContentFingerprint(content),
    caret,
    viewport,
    updatedAt
  })
  if (!entry) return false
  try {
    const previous = parseDocumentPositionStore(storage.getItem(DOCUMENT_POSITIONS_KEY), maxEntries)
    const entries = [entry, ...previous.filter((item) => item.path !== entry.path)]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, maxEntries)
    storage.setItem(
      DOCUMENT_POSITIONS_KEY,
      JSON.stringify({
        version: DOCUMENT_POSITIONS_VERSION,
        entries
      })
    )
    return true
  } catch {
    return false
  }
}
