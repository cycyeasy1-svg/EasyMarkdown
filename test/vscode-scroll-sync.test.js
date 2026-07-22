import { describe, expect, it } from 'vitest'
import scrollSync from '../packages/vscode-extension/src/scrollSync.js'

const { isSplitScrollPeer } = scrollSync

const base = {
  documentKey: 'file:///doc.md',
  editorDocumentKey: 'file:///doc.md',
  keepVisible: true,
  keepColumn: 1,
  sourceColumn: 2
}

describe('VSCode Keep scroll-sync peer detection', () => {
  it('accepts only a simultaneously visible source editor in another group', () => {
    expect(isSplitScrollPeer(base)).toBe(true)
    expect(isSplitScrollPeer({ ...base, keepVisible: false })).toBe(false)
    expect(isSplitScrollPeer({ ...base, sourceColumn: 1 })).toBe(false)
    expect(isSplitScrollPeer({ ...base, sourceColumn: undefined })).toBe(false)
    expect(isSplitScrollPeer({ ...base, editorDocumentKey: 'file:///other.md' })).toBe(false)
  })
})
