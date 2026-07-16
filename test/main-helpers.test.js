// Characterization tests for the pure main-process helpers. isRestrictedRoot /
// isAbsolutePath are the safety gate that stops chokidar from recursively
// watching "/" (which floods EACCES and aborts the whole main process on
// launch), so their behavior must not drift unnoticed.
import { describe, it, expect } from 'vitest'
import {
  MD_EXTS,
  MD_RE,
  isAbsolutePath,
  isRestrictedRoot,
  imageNameParts,
  attachmentNameParts,
  attachmentLinkMarkdown,
  shouldSkipWorkspaceEntry,
  getAllowedExternalUrl,
  searchContentLines,
  docLangAttr,
  WIN_MD_PROGID,
  winDefaultOpenerRegOps
} from '../src/main/helpers.js'

describe('getAllowedExternalUrl', () => {
  it('accepts and normalizes browser and mail links', () => {
    expect(getAllowedExternalUrl('https://example.com/docs?q=1#top')).toBe(
      'https://example.com/docs?q=1#top'
    )
    expect(getAllowedExternalUrl('HTTP://EXAMPLE.COM/path')).toBe('http://example.com/path')
    expect(getAllowedExternalUrl('mailto:user@example.com?subject=Hello')).toBe(
      'mailto:user@example.com?subject=Hello'
    )
  })

  it('rejects privileged, executable, malformed, and empty targets', () => {
    for (const value of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vscode://settings/editor.fontSize',
      'https://',
      '/relative.md',
      '',
      null
    ]) {
      expect(getAllowedExternalUrl(value)).toBe(null)
    }
  })
})

describe('winDefaultOpenerRegOps', () => {
  const exe = 'C:\\Program Files\\EasyMarkdown\\EasyMarkdown.exe'
  it('registers a per-user (HKCU) ProgId with a quoted open command', () => {
    const ops = winDefaultOpenerRegOps(exe, ['md'])
    expect(ops.every(([verb, key]) => verb === 'add' && key.startsWith('HKCU\\Software\\Classes\\'))).toBe(true)
    expect(ops.every((args) => args.includes('/f'))).toBe(true)
    const command = ops.find(([, key]) => key.endsWith('\\shell\\open\\command'))
    expect(command).toContain(`"${exe}" "%1"`)
  })
  it('adds OpenWithProgids + class default per extension', () => {
    const ops = winDefaultOpenerRegOps(exe, ['md', 'markdown'])
    for (const ext of ['md', 'markdown']) {
      const openWith = ops.find(([, key]) => key === `HKCU\\Software\\Classes\\.${ext}\\OpenWithProgids`)
      expect(openWith).toContain(WIN_MD_PROGID)
      const def = ops.find(([, key, flag]) => key === `HKCU\\Software\\Classes\\.${ext}` && flag === '/ve')
      expect(def).toContain(WIN_MD_PROGID)
    }
  })
})

describe('docLangAttr', () => {
  it('returns a lang="ja" attribute when the exported HTML contains kana', () => {
    expect(docLangAttr('<p>これは日本語の資料です</p>')).toBe(' lang="ja"')
    expect(docLangAttr('<p>カタカナ</p>')).toBe(' lang="ja"')
  })
  it('returns lang="zh" for Han-only content and empty for Latin / empty content', () => {
    expect(docLangAttr('<p>中文文档</p>')).toBe(' lang="zh"')
    expect(docLangAttr('<p>English</p>')).toBe('')
    expect(docLangAttr('')).toBe('')
    expect(docLangAttr(null)).toBe('')
  })
})

describe('MD_EXTS / MD_RE', () => {
  it('lists the supported extensions', () => {
    expect(MD_EXTS).toEqual(['md', 'markdown', 'mdx', 'txt'])
  })
  it('matches supported extensions case-insensitively at end of path', () => {
    expect(MD_RE.test('/a/b.md')).toBe(true)
    expect(MD_RE.test('C:\\a\\b.MARKDOWN')).toBe(true)
    expect(MD_RE.test('notes.txt')).toBe(true)
    expect(MD_RE.test('image.png')).toBe(false)
    expect(MD_RE.test('README')).toBe(false)
  })
})

describe('isAbsolutePath', () => {
  it('accepts POSIX / Windows-drive / UNC, rejects relative', () => {
    expect(isAbsolutePath('/x')).toBe(true)
    expect(isAbsolutePath('D:\\x')).toBe(true)
    expect(isAbsolutePath('D:/x')).toBe(true)
    expect(isAbsolutePath('\\\\srv\\share')).toBe(true)
    expect(isAbsolutePath('rel/path')).toBe(false)
    expect(isAbsolutePath('.')).toBe(false)
  })
})

describe('isRestrictedRoot', () => {
  it('restricts empty / dot / relative / root paths', () => {
    expect(isRestrictedRoot('')).toBe(true)
    expect(isRestrictedRoot('/')).toBe(true)
    expect(isRestrictedRoot('.')).toBe(true)
    expect(isRestrictedRoot('..')).toBe(true)
    expect(isRestrictedRoot('some/relative')).toBe(true)
  })
  it('restricts macOS system/device trees', () => {
    expect(isRestrictedRoot('/dev')).toBe(true)
    expect(isRestrictedRoot('/System/Volumes/Data')).toBe(true)
    expect(isRestrictedRoot('/private/var/db')).toBe(true)
  })
  it('allows a normal absolute workspace folder', () => {
    expect(isRestrictedRoot('/Users/me/notes')).toBe(false)
    expect(isRestrictedRoot('C:\\Users\\me\\notes')).toBe(false)
  })
  it('ignores a trailing separator', () => {
    expect(isRestrictedRoot('/Users/me/notes/')).toBe(false)
    expect(isRestrictedRoot('/')).toBe(true)
  })
})

describe('imageNameParts', () => {
  it('splits stem and extension', () => {
    expect(imageNameParts('photo.png')).toEqual({ stem: 'photo', ext: '.png' })
    expect(imageNameParts('a.b.c')).toEqual({ stem: 'a.b', ext: '.c' })
  })
  it('defaults a missing name/extension to image.png', () => {
    expect(imageNameParts(null)).toEqual({ stem: 'image', ext: '.png' })
    expect(imageNameParts('noext')).toEqual({ stem: 'noext', ext: '.png' })
  })
  it('sanitizes path/reserved characters', () => {
    expect(imageNameParts('a/b:c.png')).toEqual({ stem: 'a_b_c', ext: '.png' })
  })
  it('keeps a dotfile name intact with a default extension', () => {
    expect(imageNameParts('.gitignore')).toEqual({ stem: '.gitignore', ext: '.png' })
  })
})

describe('attachment helpers', () => {
  it('keeps ordinary extensions, supports extensionless files, and sanitizes names', () => {
    expect(attachmentNameParts('archive.tar.gz')).toEqual({ stem: 'archive.tar', ext: '.gz' })
    expect(attachmentNameParts('LICENSE')).toEqual({ stem: 'LICENSE', ext: '' })
    expect(attachmentNameParts('a/b:c.pdf')).toEqual({ stem: 'a_b_c', ext: '.pdf' })
  })
  it('escapes Markdown labels and wraps link targets safely', () => {
    expect(attachmentLinkMarkdown('a[b].pdf', 'assets/a b.pdf')).toBe('[a\\[b\\].pdf](<assets/a b.pdf>)')
    expect(attachmentLinkMarkdown('x', 'assets/a<b>.txt')).toBe('[x](<assets/a%3Cb%3E.txt>)')
  })
})

describe('shouldSkipWorkspaceEntry', () => {
  it('reveals dotfiles only when requested while keeping hard exclusions', () => {
    expect(shouldSkipWorkspaceEntry('.claude', true, false)).toBe(true)
    expect(shouldSkipWorkspaceEntry('.claude', true, true)).toBe(false)
    expect(shouldSkipWorkspaceEntry('.env', false, true)).toBe(false)
    expect(shouldSkipWorkspaceEntry('.gitignore', false, false)).toBe(false)
    expect(shouldSkipWorkspaceEntry('.git', true, true)).toBe(true)
    expect(shouldSkipWorkspaceEntry('node_modules', true, true)).toBe(true)
  })
})

describe('searchContentLines (workspace full-text search)', () => {
  const content = 'Alpha beta\ngamma ALPHA\n\nalphabet soup\n'

  it('finds case-insensitive hits with 1-based line numbers and columns', () => {
    const { matches } = searchContentLines(content, 'alpha')
    expect(matches.map((m) => [m.line, m.col])).toEqual([[1, 0], [2, 6], [4, 0]])
    expect(matches[0]).toMatchObject({ len: 5, text: 'Alpha beta', textCol: 0 })
  })
  it('honors caseSensitive and wholeWord', () => {
    expect(searchContentLines(content, 'alpha', { caseSensitive: true }).matches.map((m) => m.line)).toEqual([4])
    expect(searchContentLines(content, 'alpha', { wholeWord: true }).matches.map((m) => m.line)).toEqual([1, 2])
  })
  it('supports regex and reports invalid patterns without throwing', () => {
    const { matches } = searchContentLines('a1 b22\nc333', '[a-z](\\d+)', { regex: true })
    expect(matches.map((m) => [m.line, m.col, m.len])).toEqual([[1, 0, 2], [1, 3, 3], [2, 0, 4]])
    expect(searchContentLines('x', '[', { regex: true })).toMatchObject({ matches: [], error: 'regex' })
  })
  it('caps the number of hits per file', () => {
    const many = Array(30).fill('hit hit hit').join('\n')
    expect(searchContentLines(many, 'hit', {}, 10).matches).toHaveLength(10)
  })
  it('excerpts very long lines around the match and adjusts textCol', () => {
    const long = 'x'.repeat(500) + 'NEEDLE' + 'y'.repeat(500)
    const { matches } = searchContentLines(long, 'NEEDLE')
    const m = matches[0]
    expect(m.col).toBe(500)
    expect(m.text.length).toBeLessThanOrEqual(241) // 240 + leading ellipsis
    expect(m.text.slice(m.textCol, m.textCol + m.len)).toBe('NEEDLE')
  })
  it('returns nothing for an empty query or content', () => {
    expect(searchContentLines('', 'x').matches).toEqual([])
    expect(searchContentLines('abc', '').matches).toEqual([])
  })
})
