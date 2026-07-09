// Characterization tests for relative-image-path resolution. This is the
// cross-platform-critical logic that turns a document-relative src into a
// display-only file:// URL (the doc model keeps the original relative path).
import { describe, it, expect } from 'vitest'
import { dirOf, isRelativePath, resolveToFileUrl } from '../src/renderer/src/components/editor-images.js'

describe('dirOf', () => {
  it('returns the parent dir, normalizing backslashes', () => {
    expect(dirOf('/a/b/c.md')).toBe('/a/b')
    expect(dirOf('C:\\a\\b.md')).toBe('C:/a')
  })
  it('returns null when there is no separator or no path', () => {
    expect(dirOf('c.md')).toBe(null)
    expect(dirOf('')).toBe(null)
    expect(dirOf(null)).toBe(null)
  })
})

describe('isRelativePath', () => {
  it('is false for URLs with a scheme', () => {
    expect(isRelativePath('http://a.com/x.png')).toBe(false)
    expect(isRelativePath('data:image/png;base64,AAAA')).toBe(false)
    expect(isRelativePath('file:///x.png')).toBe(false)
    expect(isRelativePath('C:/x.png')).toBe(false) // drive letter reads as a scheme
  })
  it('is false for protocol-relative and absolute POSIX paths', () => {
    expect(isRelativePath('//cdn/x.png')).toBe(false)
    expect(isRelativePath('/abs/x.png')).toBe(false)
  })
  it('is true for a document-relative path', () => {
    expect(isRelativePath('assets/x.png')).toBe(true)
    expect(isRelativePath('./assets/x.png')).toBe(true)
    expect(isRelativePath('../img/x.png')).toBe(true)
  })
  it('is false for empty input', () => {
    expect(isRelativePath('')).toBe(false)
  })
})

describe('resolveToFileUrl', () => {
  it('resolves a relative src against a POSIX base dir', () => {
    expect(resolveToFileUrl('/home/u/notes', 'assets/x.png')).toBe('file:///home/u/notes/assets/x.png')
  })
  it('resolves a relative src against a Windows base dir', () => {
    expect(resolveToFileUrl('C:\\Users\\u\\notes', 'assets/x.png')).toBe(
      'file:///C:/Users/u/notes/assets/x.png'
    )
  })
  it('walks .. segments and ignores . / empty segments', () => {
    expect(resolveToFileUrl('/home/u/notes', '../img/x.png')).toBe('file:///home/u/img/x.png')
    expect(resolveToFileUrl('/home/u/notes', './x.png')).toBe('file:///home/u/notes/x.png')
  })
  it('does not double-encode a src that already carries a percent escape', () => {
    // encodeURI turns a literal `%` into `%25`, so `a%20b.png` — the spec-compliant
    // way to write a space in a link destination — used to resolve to `a%2520b.png`
    // and 404. A lone `%` with no valid escape after it still gets encoded.
    expect(resolveToFileUrl('/home/u', 'pics/a%20b.png')).toBe('file:///home/u/pics/a%20b.png')
    expect(resolveToFileUrl('/home/u', 'pics/%E5%9B%BE.png')).toBe('file:///home/u/pics/%E5%9B%BE.png')
    expect(resolveToFileUrl('/home/u', '100%.png')).toBe('file:///home/u/100%25.png')
  })
  it('URL-encodes spaces in the resolved path', () => {
    expect(resolveToFileUrl('/home/u', 'my pics/a b.png')).toBe('file:///home/u/my%20pics/a%20b.png')
  })
})
