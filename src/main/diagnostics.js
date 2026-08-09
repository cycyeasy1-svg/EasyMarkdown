const REDACTED = '[REDACTED]'
const TRUNCATED = '[TRUNCATED]'
const MAX_DEPTH = 5
const MAX_ARRAY_ITEMS = 40
const MAX_OBJECT_KEYS = 60
const MAX_STRING_LENGTH = 4000

const SENSITIVE_KEY_RE =
  /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|clipboard|document|markdown|html|content|source)/i
const PATH_KEY_RE = /(?:^|[-_])(?:path|paths|directory|dir|folder|file|filename|url|uri)(?:$|[-_])/i
const RECOVERABLE_FS_CODES = new Set(['EACCES', 'EPERM', 'EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE'])

function sanitizeString(input) {
  let value = String(input)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /((?:password|passwd|secret|token|api[-_]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      `$1${REDACTED}`
    )
    .replace(/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED)
    // Stack traces and error messages often contain local paths. Diagnostic
    // bundles need the failing module/line, not a user's account or document
    // location, so replace the path while retaining a trailing :line:column.
    .replace(/\bfile:\/{2,3}[^\s)'"<>]+/gi, '<local-path>')
    .replace(/\b[A-Za-z]:[\\/][^\r\n\t)'"<>]+/g, '<local-path>')
    .replace(/\\\\[^\s\\/]+[\\/][^\r\n\t)'"<>]+/g, '<local-path>')
    .replace(/\/(?:Users|home|private|tmp|var\/folders)\/[^\s)'"<>]+/g, '<local-path>')

  if (value.length > MAX_STRING_LENGTH) value = `${value.slice(0, MAX_STRING_LENGTH)}…${TRUNCATED}`
  return value
}

export function sanitizeDiagnosticValue(input) {
  const seen = new WeakSet()

  const visit = (value, depth, key = '') => {
    if (SENSITIVE_KEY_RE.test(key)) return REDACTED
    if (PATH_KEY_RE.test(key) && value != null) return '<local-path>'
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
    if (typeof value === 'bigint') return String(value)
    if (typeof value === 'string') return sanitizeString(value)
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    if (depth >= MAX_DEPTH) return TRUNCATED
    if (seen.has(value)) return '[CIRCULAR]'
    seen.add(value)

    if (Array.isArray(value)) {
      const result = value.slice(0, MAX_ARRAY_ITEMS).map((item) => visit(item, depth + 1))
      if (value.length > MAX_ARRAY_ITEMS) result.push(TRUNCATED)
      return result
    }

    const result = {}
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS)
    for (const [childKey, childValue] of entries) {
      const sanitized = visit(childValue, depth + 1, childKey)
      if (sanitized !== undefined) result[childKey] = sanitized
    }
    if (Object.keys(value).length > MAX_OBJECT_KEYS) result._truncated = true
    return result
  }

  return visit(input, 0)
}

export function diagnosticErrorDetails(error) {
  if (error instanceof Error) {
    return sanitizeDiagnosticValue({
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    })
  }
  return sanitizeDiagnosticValue({ message: String(error) })
}

export function createDiagnosticRecord({ level = 'info', event, details, now = Date.now() }) {
  const normalizedLevel = ['debug', 'info', 'warn', 'error', 'fatal'].includes(level)
    ? level
    : 'info'
  const normalizedEvent = String(event || 'unknown')
    .replace(/[^a-zA-Z0-9_.:-]/g, '-')
    .slice(0, 120)

  return {
    timestamp: new Date(now).toISOString(),
    level: normalizedLevel,
    event: normalizedEvent || 'unknown',
    details: sanitizeDiagnosticValue(details || {})
  }
}

// Permission/busy errors from chokidar and background filesystem activity are
// recoverable: their feature-level handlers already isolate the failed watch.
// Unknown exceptions are not safe to continue after and must take the fatal
// path so the next launch can enter crash-loop recovery.
export function isRecoverableBackgroundError(error) {
  const code = error?.code || error?.cause?.code
  return RECOVERABLE_FS_CODES.has(String(code || '').toUpperCase())
}

export const DIAGNOSTIC_REDACTED = REDACTED
