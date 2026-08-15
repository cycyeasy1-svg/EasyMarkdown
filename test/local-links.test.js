import { describe, expect, it } from 'vitest'
import { resolveLocalLinkPath } from '../src/main/local-links.js'
import {
  isMarkdownDocumentLink,
  parseInternalDocLink
} from '../src/renderer/src/link-navigation.js'

describe('local link resolution', () => {
  it('resolves relative, Windows drive, UNC, and file URLs', () => {
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'assets/report.pdf').path).toBe(
      'C:\\Docs\\assets\\report.pdf'
    )
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'D:\\Shared\\guide.md#intro').path).toBe(
      'D:\\Shared\\guide.md'
    )
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', '\\\\server\\share\\manual.pdf').path).toBe(
      '\\\\server\\share\\manual.pdf'
    )
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'file:///C:/Shared/manual.pdf#p2').path).toBe(
      'C:\\Shared\\manual.pdf'
    )
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'file://server/share/manual.pdf').path).toBe(
      '\\\\server\\share\\manual.pdf'
    )
  })

  it('rejects non-local schemes, invalid bases, NUL, and dangerous extensions', () => {
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'https://example.com/a.pdf').ok).toBe(false)
    expect(resolveLocalLinkPath('relative.md', 'asset.pdf').ok).toBe(false)
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'bad\0name.pdf').ok).toBe(false)
    expect(resolveLocalLinkPath('C:\\Docs\\note.md', 'payload.ps1')).toMatchObject({
      ok: true,
      blockedExtension: '.ps1'
    })
  })

  it('classifies renderer document targets without treating a drive as a scheme', () => {
    expect(parseInternalDocLink('file:///C:/Docs/guide.md#Start')).toEqual({
      path: 'C:/Docs/guide.md',
      anchor: 'Start'
    })
    expect(parseInternalDocLink('D:\\Docs\\guide.md#Start')).toEqual({
      path: 'D:\\Docs\\guide.md',
      anchor: 'Start'
    })
    expect(isMarkdownDocumentLink('../guide')).toBe(true)
    expect(isMarkdownDocumentLink('assets/report.pdf')).toBe(false)
    expect(parseInternalDocLink('javascript:alert(1)')).toBeNull()
  })
})
