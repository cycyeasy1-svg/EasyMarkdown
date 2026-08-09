import { describe, expect, it } from 'vitest'
import {
  createDiagnosticRecord,
  diagnosticErrorDetails,
  isRecoverableBackgroundError,
  sanitizeDiagnosticValue
} from '../src/main/diagnostics.js'

describe('diagnostic privacy boundary', () => {
  it('redacts document data, credentials, and absolute local paths', () => {
    const sanitized = sanitizeDiagnosticValue({
      documentContent: '# private draft',
      authorization: 'Bearer abc.def.ghi',
      nested: {
        token: 'github_pat_123456789012345678901234',
        message: 'Failed at file:///E:/AI/private/work.md:10:2',
        stack: 'Error: boom\n    at run (C:\\Users\\Alice\\project\\app.js:4:2)',
        filePath: 'E:\\AI\\private\\work.md'
      }
    })
    const json = JSON.stringify(sanitized)
    expect(json).not.toContain('private draft')
    expect(json).not.toContain('github_pat_')
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('E:/AI')
    expect(json).not.toContain('E:\\\\AI')
    expect(json).toContain('[REDACTED]')
    expect(json).toContain('<local-path>')
  })

  it('bounds records and normalizes unsafe event names', () => {
    const record = createDiagnosticRecord({
      level: 'unexpected',
      event: 'renderer failed with spaces',
      details: { message: 'x'.repeat(5000) },
      now: 0
    })
    expect(record).toMatchObject({
      timestamp: '1970-01-01T00:00:00.000Z',
      level: 'info',
      event: 'renderer-failed-with-spaces'
    })
    expect(record.details.message.length).toBeLessThan(4100)
  })

  it('serializes Error details without leaking a local stack path', () => {
    const error = new Error('Could not open C:\\Users\\Alice\\secret.md')
    error.code = 'EACCES'
    const details = diagnosticErrorDetails(error)
    expect(details.code).toBe('EACCES')
    expect(JSON.stringify(details)).not.toContain('Alice')
  })
})

describe('main failure policy', () => {
  it('keeps known filesystem permission/busy failures recoverable', () => {
    for (const code of ['EACCES', 'EPERM', 'EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE']) {
      expect(isRecoverableBackgroundError({ code })).toBe(true)
    }
  })

  it('treats unknown programming failures as fatal', () => {
    expect(isRecoverableBackgroundError(new TypeError('broken invariant'))).toBe(false)
    expect(isRecoverableBackgroundError({ code: 'ENOENT' })).toBe(false)
  })
})
