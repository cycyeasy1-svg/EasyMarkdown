import { describe, expect, it } from 'vitest'
import {
  decodeUtf8Bytes,
  detectLineEnding,
  encodeUtf8Text,
  isMarkdownFileName,
  normalizeWorkspacePath,
  resolveWorkspacePath,
  sortWorkspaceNodes
} from '../packages/web-lite/src/browser-files.js'

describe('web-lite browser file helpers', () => {
  it('accepts only the Markdown extensions supported by the lightweight editor', () => {
    expect(isMarkdownFileName('README.md')).toBe(true)
    expect(isMarkdownFileName('仕様.MARKDOWN')).toBe(true)
    expect(isMarkdownFileName('component.mdx')).toBe(true)
    expect(isMarkdownFileName('notes.txt')).toBe(false)
    expect(isMarkdownFileName('payload.md.exe')).toBe(false)
  })

  it('resolves document-relative paths without escaping the selected workspace', () => {
    expect(resolveWorkspacePath('docs/design/page.md', '../assets/figure 1.png')).toBe(
      'docs/assets/figure 1.png'
    )
    expect(resolveWorkspacePath('docs/page.md', './other.md#section')).toBe('docs/other.md')
    expect(resolveWorkspacePath('docs/page.md', 'sub/a%20b.md?raw=1')).toBe('docs/sub/a b.md')
    expect(resolveWorkspacePath('page.md', '../outside.md')).toBeNull()
    expect(resolveWorkspacePath('page.md', 'https://example.com/a.md')).toBeNull()
    expect(resolveWorkspacePath('page.md', 'C:\\secret.md')).toBeNull()
  })

  it('normalizes separators and rejects parent traversal above the root', () => {
    expect(normalizeWorkspacePath('a\\b/../c.md')).toBe('a/c.md')
    expect(normalizeWorkspacePath('../../c.md')).toBeNull()
  })

  it('round-trips UTF-8 content while preserving the BOM choice', () => {
    const withBom = encodeUtf8Text('日本語\r\n中文', true)
    expect(Array.from(withBom.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(decodeUtf8Bytes(withBom)).toEqual({ bom: true, content: '日本語\r\n中文' })

    const withoutBom = encodeUtf8Text('plain\ntext', false)
    expect(decodeUtf8Bytes(withoutBom)).toEqual({ bom: false, content: 'plain\ntext' })
  })

  it('keeps line-ending detection explicit for the status surface', () => {
    expect(detectLineEnding('a\r\nb')).toBe('CRLF')
    expect(detectLineEnding('a\nb')).toBe('LF')
  })

  it('sorts directories before files using natural name ordering', () => {
    const nodes = sortWorkspaceNodes([
      { type: 'file', name: '10.md' },
      { type: 'directory', name: 'zeta' },
      { type: 'file', name: '2.md' },
      { type: 'directory', name: 'alpha' }
    ])
    expect(nodes.map((node) => node.name)).toEqual(['alpha', 'zeta', '2.md', '10.md'])
  })
})
