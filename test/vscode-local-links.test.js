import { describe, expect, it } from 'vitest'
import { parseLocalLinkReference } from '../src/shared/local-link-reference.js'

describe('VS Code local link references', () => {
  it('accepts relative, workspace-root, drive, UNC, and file URL references', () => {
    expect(parseLocalLinkReference('../guide.md#Start')).toEqual({
      kind: 'relative',
      path: '../guide.md',
      fragment: 'Start'
    })
    expect(parseLocalLinkReference('/docs/guide.md')).toMatchObject({ kind: 'workspace-root' })
    expect(parseLocalLinkReference('D:\\Docs\\guide.md')).toMatchObject({
      kind: 'absolute',
      path: 'D:\\Docs\\guide.md'
    })
    expect(parseLocalLinkReference('\\\\server\\share\\guide.md')).toMatchObject({
      kind: 'absolute'
    })
    expect(parseLocalLinkReference('file:///C:/Docs/guide.md#Intro')).toEqual({
      kind: 'file-url',
      uri: 'file:///C:/Docs/guide.md',
      fragment: 'Intro'
    })
  })

  it('rejects remote and executable webview schemes', () => {
    expect(parseLocalLinkReference('https://example.com/guide.md')).toBeNull()
    expect(parseLocalLinkReference('javascript:alert(1)')).toBeNull()
    expect(parseLocalLinkReference('bad\0path.md')).toBeNull()
  })
})
