import { describe, expect, it } from 'vitest'
import { isSafeIpcPath, validateIpcArgs } from '../src/main/ipc-policy.js'

describe('IPC argument policy', () => {
  it('accepts native absolute paths and rejects relative, NUL, and oversized paths', () => {
    expect(isSafeIpcPath('C:\\docs\\note.md')).toBe(true)
    expect(isSafeIpcPath('/Users/easy/note.md')).toBe(true)
    expect(isSafeIpcPath('notes/note.md')).toBe(false)
    expect(isSafeIpcPath('C:\\docs\\bad\0name.md')).toBe(false)
    expect(isSafeIpcPath(`C:\\${'a'.repeat(32_768)}`)).toBe(false)
  })

  it('blocks destructive or recursive operations against restricted roots', () => {
    expect(validateIpcArgs('fs:delete', ['/'])).toBe(false)
    expect(validateIpcArgs('fs:createDir', ['C:\\'])).toBe(false)
    expect(validateIpcArgs('watch:start', ['/dev'])).toBe(false)
    expect(validateIpcArgs('fs:delete', ['/Users/easy/note.md'])).toBe(true)
  })

  it('validates every path position on multi-path operations', () => {
    expect(validateIpcArgs('fs:rename', ['/tmp/a.md', '/tmp/b.md'])).toBe(true)
    expect(validateIpcArgs('fs:rename', ['/tmp/a.md', '../b.md'])).toBe(false)
    expect(validateIpcArgs('attachment:save', [null, '/tmp/image.png'])).toBe(true)
    expect(validateIpcArgs('attachment:save', [null, 'image.png'])).toBe(false)
  })

  it('keeps small scalar contracts narrow', () => {
    expect(validateIpcArgs('dialog:saveAs', ['Untitled.md'])).toBe(true)
    expect(validateIpcArgs('dialog:saveAs', ['x'.repeat(256)])).toBe(false)
    expect(validateIpcArgs('spell:set', [true])).toBe(true)
    expect(validateIpcArgs('spell:set', ['true'])).toBe(false)
    expect(validateIpcArgs('app:setLang', ['ja'])).toBe(true)
    expect(validateIpcArgs('app:setLang', ['de'])).toBe(false)
  })

  it('bounds renderer diagnostic events and payloads', () => {
    expect(validateIpcArgs('diagnostics:export', [])).toBe(true)
    expect(validateIpcArgs('diagnostics:export', ['unexpected'])).toBe(false)
    expect(validateIpcArgs('diagnostics:log', ['error', 'render-failure', { message: 'boom' }])).toBe(true)
    expect(validateIpcArgs('diagnostics:log', ['fatal', 'render-failure', {}])).toBe(false)
    expect(validateIpcArgs('diagnostics:log', ['error', 'bad event', {}])).toBe(false)
    expect(validateIpcArgs('diagnostics:log', ['error', 'too-large', { message: 'x'.repeat(20_000) }])).toBe(false)
  })
})
