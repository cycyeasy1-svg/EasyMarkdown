import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { createDiagnosticRecord, sanitizeDiagnosticValue } from './diagnostics.js'

const DEFAULT_MAX_BYTES = 1024 * 1024
const DEFAULT_MAX_FILES = 3

export function createLocalLogger({
  directory,
  context = {},
  maxBytes = DEFAULT_MAX_BYTES,
  maxFiles = DEFAULT_MAX_FILES,
  now = () => Date.now()
}) {
  const currentPath = join(directory, 'main.ndjson')
  let disabled = false

  const tryIo = (operation, fallback) => {
    if (disabled) return fallback
    try {
      mkdirSync(directory, { recursive: true })
      return operation()
    } catch (error) {
      disabled = true
      console.error('EasyMarkdown diagnostics unavailable:', error?.message || error)
      return fallback
    }
  }

  const rotatedPath = (index) => (index === 0 ? currentPath : `${currentPath}.${index}`)

  const rotateIfNeeded = (incomingBytes) => {
    const size = existsSync(currentPath) ? statSync(currentPath).size : 0
    if (size + incomingBytes <= maxBytes) return
    for (let index = maxFiles - 1; index >= 1; index--) {
      const source = rotatedPath(index - 1)
      const target = rotatedPath(index)
      if (!existsSync(source)) continue
      if (existsSync(target)) rmSync(target, { force: true })
      renameSync(source, target)
    }
  }

  const log = (level, event, details = {}) => {
    const record = createDiagnosticRecord({ level, event, details, now: now() })
    const line = `${JSON.stringify(record)}\n`
    tryIo(() => {
      rotateIfNeeded(Buffer.byteLength(line))
      appendFileSync(currentPath, line, { encoding: 'utf8', mode: 0o600 })
    })
    return record
  }

  const readEntries = () =>
    tryIo(() => {
      const entries = []
      // Oldest archive first, current file last, so an exported report is
      // chronological without exposing any filesystem filenames.
      for (let index = maxFiles - 1; index >= 0; index--) {
        const path = rotatedPath(index)
        if (!existsSync(path)) continue
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
          if (!line) continue
          try {
            entries.push(sanitizeDiagnosticValue(JSON.parse(line)))
          } catch {
            entries.push(createDiagnosticRecord({
              level: 'warn',
              event: 'diagnostics.invalid-log-line',
              now: now()
            }))
          }
        }
      }
      return entries
    }, [])

  const createBundle = (runtime = {}) => ({
    schemaVersion: 1,
    generatedAt: new Date(now()).toISOString(),
    context: sanitizeDiagnosticValue({ ...context, ...runtime }),
    entries: readEntries()
  })

  return {
    debug: (event, details) => log('debug', event, details),
    info: (event, details) => log('info', event, details),
    warn: (event, details) => log('warn', event, details),
    error: (event, details) => log('error', event, details),
    fatal: (event, details) => log('fatal', event, details),
    createBundle,
    readEntries
  }
}
