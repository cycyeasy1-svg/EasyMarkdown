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
  extractMarkdownHeadings,
  extractMarkdownLinks,
  slugifyMarkdownAnchor,
  docLangAttr,
  WIN_MD_PROGID,
  winDefaultOpenerRegOps
} from '../src/main/helpers.js'
import {
  collectMarkdownAnchors,
  createFileRenamePlan,
  createHeadingRenamePlan,
  diagnoseMarkdownContent,
  findMarkdownReferences,
  relativeMarkdownPath,
  resolveMarkdownTarget,
  splitMarkdownTarget
} from '../src/main/markdown-links.js'

describe('Markdown link intelligence', () => {
  const winFiles = [
    {
      path: 'C:\\notes\\guide.md',
      content: '# Guide\n\n## Install Here\n\n[Self](#install-here)\n'
    },
    {
      path: 'C:\\notes\\index.md',
      content: '[Guide](guide.md#install-here)\n![Logo](assets/logo.png)\n'
    }
  ]

  it('extracts exact inline/image/definition targets while skipping code and fences', () => {
    const source = [
      '[Doc](<folder/a b.md#top>) and ![x](img.png)',
      '`[skip](no.md)`',
      '[ref]: target.md',
      '```md',
      '[skip](also-no.md)',
      '```'
    ].join('\n')
    expect(extractMarkdownLinks(source).map(({ target, isImage, kind, line }) => ({
      target, isImage, kind, line
    }))).toEqual([
      { target: 'folder/a b.md#top', isImage: false, kind: 'inline', line: 1 },
      { target: 'img.png', isImage: true, kind: 'inline', line: 1 },
      { target: 'target.md', isImage: false, kind: 'definition', line: 3 }
    ])
  })

  it('normalizes anchors and resolves encoded relative paths on Windows and POSIX', () => {
    expect(slugifyMarkdownAnchor(' Hello, 世界! ')).toBe('hello-世界')
    expect(splitMarkdownTarget('guide%20one.md?q=1#Hello%20World')).toMatchObject({
      path: 'guide%20one.md',
      query: '?q=1',
      anchor: 'Hello World'
    })
    expect(resolveMarkdownTarget('C:\\notes\\index.md', 'sub/a%20b.md#top')).toMatchObject({
      kind: 'local',
      path: 'C:\\notes\\sub\\a b.md',
      anchor: 'top'
    })
    expect(resolveMarkdownTarget('/notes/index.md', '../guide.md')).toMatchObject({
      kind: 'local',
      path: '/guide.md'
    })
    expect(resolveMarkdownTarget('/notes/index.md', 'javascript:alert(1)').kind).toBe('invalid-url')
  })

  it('collects duplicate and explicit heading anchors', () => {
    const anchors = collectMarkdownAnchors('# One\n## One\n### Stable {#fixed}\n<div id="raw"></div>')
    expect([...anchors.entries()]).toEqual([
      ['one', 1],
      ['one-1', 2],
      ['fixed', 3],
      ['raw', 4]
    ])
  })

  it('diagnoses missing docs, images, anchors and disallowed URLs', async () => {
    const existing = new Map([
      ['C:\\notes\\guide.md', '# Guide\n'],
      ['C:\\notes\\assets\\ok.png', 'binary']
    ])
    const content = [
      '[ok](guide.md#guide)',
      '[bad anchor](guide.md#missing)',
      '[missing](none.md)',
      '![missing image](assets/no.png)',
      '[bad](javascript:alert(1))'
    ].join('\n')
    const problems = await diagnoseMarkdownContent({
      docPath: 'C:\\notes\\index.md',
      content,
      exists: async (path) => existing.has(path),
      readFile: async (path) => existing.get(path)
    })
    expect(problems.map((problem) => problem.kind)).toEqual([
      'missing-anchor',
      'missing-document',
      'missing-image',
      'invalid-url'
    ])
  })

  it('finds file and heading references with search-compatible result items', () => {
    const groups = findMarkdownReferences(winFiles, 'C:\\notes\\guide.md', 'install-here')
    expect(groups.map((group) => [group.path, group.items[0].line])).toEqual([
      ['C:\\notes\\guide.md', 5],
      ['C:\\notes\\index.md', 1]
    ])
  })

  it('creates a minimal heading rename plan and keeps explicit ids stable', () => {
    const plan = createHeadingRenamePlan(winFiles, 'C:\\notes\\guide.md', 3, 'Install Now')
    expect(plan).toMatchObject({
      oldAnchor: 'install-here',
      newAnchor: 'install-now',
      totalChanges: 3
    })
    expect(plan.files.find((file) => file.path.endsWith('guide.md')).updated).toContain('## Install Now')
    expect(plan.files.find((file) => file.path.endsWith('index.md')).updated).toContain(
      'guide.md#install-now'
    )
  })

  it('creates encoded relative paths and a file rename plan without touching unrelated text', () => {
    expect(relativeMarkdownPath(
      'C:\\notes\\index.md',
      'C:\\notes\\Guide New.md',
      './guide.md'
    )).toBe('./Guide%20New.md')
    const plan = createFileRenamePlan(winFiles, 'C:\\notes\\guide.md', 'C:\\notes\\Guide New.md')
    expect(plan.files.map((file) => file.path)).toEqual(['C:\\notes\\index.md'])
    expect(plan.files[0].updated).toBe(
      '[Guide](Guide%20New.md#install-here)\n![Logo](assets/logo.png)\n'
    )
  })

  it('keeps outbound relative links valid when a Markdown file moves folders', () => {
    const files = [
      {
        path: '/notes/guide.md',
        content: '[Index](index.md#home)\n[Self](guide.md#guide)\n'
      },
      {
        path: '/notes/index.md',
        content: '[Guide](guide.md#guide)\n'
      }
    ]
    const plan = createFileRenamePlan(files, '/notes/guide.md', '/notes/archive/guide.md')
    expect(plan.files.find((file) => file.path === '/notes/guide.md').updated).toBe(
      '[Index](../index.md#home)\n[Self](guide.md#guide)\n'
    )
    expect(plan.files.find((file) => file.path === '/notes/index.md').updated).toBe(
      '[Guide](archive/guide.md#guide)\n'
    )
  })
})

describe('extractMarkdownHeadings', () => {
  it('indexes ATX headings with 1-based lines and skips front matter and fences', () => {
    const content = [
      '---',
      '# front matter value',
      '---',
      '# Real title',
      '',
      '```md',
      '## code example',
      '```',
      '### Detail ###'
    ].join('\n')
    expect(extractMarkdownHeadings(content)).toEqual([
      { text: 'Real title', level: 1, line: 4 },
      { text: 'Detail', level: 3, line: 9 }
    ])
  })

  it('caps results and ignores hashes without heading whitespace', () => {
    expect(extractMarkdownHeadings('# one\n#two\n## three\n### four', 2)).toEqual([
      { text: 'one', level: 1, line: 1 },
      { text: 'three', level: 2, line: 3 }
    ])
  })
})

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
