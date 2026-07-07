// Characterization tests for the keep-mode parser/renderer (pure functions).
// These lock the *current* behavior of the Markdown source map + inline render
// so refactors (e.g. swapping in a remark-based parser) can't silently change
// output. See keep-parser.js's header for the \r / "zero diff" contract.
import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  escapeAttr,
  inline,
  splitRow,
  toViewLines,
  parseDoc,
  replaceCellInLine,
  insertColumnInLine,
  removeColumnInLine,
  buildTableRow,
  extractHeadings,
  renderBlockInner,
  detectDocLang
} from '../src/renderer/src/keep-parser.js'

describe('detectDocLang', () => {
  it('detects hiragana / katakana / halfwidth katakana as Japanese', () => {
    expect(detectDocLang('これはメモです')).toBe('ja')
    expect(detectDocLang('カタカナ only')).toBe('ja')
    expect(detectDocLang('ﾊﾝｶｸ')).toBe('ja')
  })
  it('does NOT treat Han-only or Latin text as Japanese', () => {
    expect(detectDocLang('这是中文文档,汉字与英文 mixed。')).toBe('')
    expect(detectDocLang('plain English only')).toBe('')
    expect(detectDocLang('')).toBe('')
  })
  it('accepts an array of lines and short-circuits on the first kana hit', () => {
    expect(detectDocLang(['# title', '中文', '仕様です'])).toBe('ja')
    expect(detectDocLang(['# title', '中文'])).toBe('')
  })
  it('ignores kana-range punctuation lookalikes (・ ー are excluded from the range)', () => {
    // U+30FB katakana middle dot / U+30FC prolonged mark appear in Chinese text
    // (names, loanwords) — they alone must not flip a doc to Japanese.
    expect(detectDocLang('乔治・R・R・马丁')).toBe('')
  })
})

describe('escapeHtml / escapeAttr', () => {
  it('escapes &, <, > for HTML', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })
  it('escapeAttr also escapes double quotes', () => {
    expect(escapeAttr('say "hi" & <b>')).toBe('say &quot;hi&quot; &amp; &lt;b&gt;')
  })
  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('inline', () => {
  it('renders bold, italic and inline code', () => {
    expect(inline('**b** and *i* and `c`')).toBe(
      '<strong>b</strong> and <em>i</em> and <code>c</code>'
    )
  })
  it('does not mistake a space-wrapped number in prose for a code placeholder', () => {
    // Regression: the code-span placeholder was once ` N `, so literal prose like
    // "以下 2 区域" got restored as <code>undefined</code>.
    expect(inline('人間は以下 2 区域')).toBe('人間は以下 2 区域')
    expect(inline('`a` then 0 and `b`')).toBe('<code>a</code> then 0 and <code>b</code>')
  })
  it('keeps inline code contents literal — escaped, with no entity decode or bold', () => {
    // escapeHtml runs on the whole segment before code spans are pulled out, so a
    // code span's `&` is already `&amp;` and stays that way (never decoded back).
    expect(inline('`&nbsp; **x**`')).toBe('<code>&amp;nbsp; **x**</code>')
  })
  it('renders links and neutralizes javascript: schemes', () => {
    expect(inline('[ok](https://a.com)')).toBe(
      '<a href="https://a.com" target="_blank" rel="noopener">ok</a>'
    )
    expect(inline('[x](javascript:void)')).toBe(
      '<a href="" target="_blank" rel="noopener">x</a>'
    )
  })
  it('renders an image with an absolute URL src', () => {
    expect(inline('![logo](https://x.com/a.png)')).toBe('<img src="https://x.com/a.png" alt="logo">')
  })
  it('resolves a relative image path against baseDir to a file:// URL', () => {
    expect(inline('![a](./assets/p.png)', '/home/u/notes')).toBe(
      '<img src="file:///home/u/notes/assets/p.png" alt="a">'
    )
  })
  it('leaves a relative image path as-is when no baseDir is given', () => {
    expect(inline('![a](./p.png)')).toBe('<img src="./p.png" alt="a">')
  })
  it('blanks a javascript: image src but allows data: URLs', () => {
    expect(inline('![x](javascript:alert)')).toBe('<img src="" alt="x">')
    expect(inline('![x](data:image/png;base64,AAAA)')).toBe('<img src="data:image/png;base64,AAAA" alt="x">')
  })
  it('does not leave a stray ! before an image (regression)', () => {
    expect(inline('![a](b.png)')).not.toContain('!<')
  })
  it('splits <br> into real line breaks', () => {
    expect(inline('a<br>b')).toBe('a<br>b')
    expect(inline('a<br/>b')).toBe('a<br>b')
  })
  it('decodes well-formed entities but keeps a bare & literal', () => {
    expect(inline('a&nbsp;b')).toBe('a&nbsp;b')
    expect(inline('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })
})

describe('splitRow', () => {
  it('splits a leading/trailing-pipe row and trims cells', () => {
    expect(splitRow('| a | b | c |')).toEqual(['a', 'b', 'c'])
  })
  it('splits a borderless row', () => {
    expect(splitRow('a | b')).toEqual(['a', 'b'])
  })
  it('keeps escaped pipes inside a cell', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c'])
  })
})

describe('toViewLines', () => {
  it('strips a trailing \\r but leaves \\r-free lines intact', () => {
    expect(toViewLines(['a\r', 'b', 'c\r'])).toEqual(['a', 'b', 'c'])
  })
})

describe('parseDoc', () => {
  it('parses a heading with level and text', () => {
    expect(parseDoc(['## Hello'])).toEqual([
      { type: 'heading', start: 0, end: 0, level: 2, text: 'Hello' }
    ])
  })
  it('groups consecutive non-blank lines into one paragraph', () => {
    const blocks = parseDoc(['line one', 'line two', '', 'next'])
    expect(blocks).toEqual([
      { type: 'paragraph', start: 0, end: 1 },
      { type: 'paragraph', start: 3, end: 3 }
    ])
  })
  it('parses a fenced code block and captures the language', () => {
    const blocks = parseDoc(['```mermaid', 'graph TD', '```'])
    expect(blocks).toEqual([{ type: 'code', start: 0, end: 2, lang: 'mermaid' }])
  })
  it('parses a GFM table with header/separator/data rows', () => {
    const blocks = parseDoc(['| a | b |', '| - | - |', '| 1 | 2 |'])
    expect(blocks).toHaveLength(1)
    const t = blocks[0]
    expect(t.type).toBe('table')
    expect(t.headers).toEqual(['a', 'b'])
    expect(t.dataRows).toEqual([{ lineIdx: 2, cells: ['1', '2'] }])
  })
  it('parses blockquotes, hr and lists', () => {
    expect(parseDoc(['> quote'])[0].type).toBe('quote')
    expect(parseDoc(['---'])[0].type).toBe('hr')
    expect(parseDoc(['- a', '- b'])[0]).toMatchObject({ type: 'list', start: 0, end: 1 })
  })
  it('keeps a bullet list as a single block (only numbered lists split)', () => {
    const blocks = parseDoc(['- a', '- b', '- c'])
    expect(blocks).toEqual([{ type: 'list', start: 0, end: 2 }])
  })
  it('splits a numbered list into one block per top-level item (番号 granularity)', () => {
    const blocks = parseDoc(['1. first', '   - detail', '2. second', '3. third'])
    expect(blocks).toEqual([
      { type: 'list', start: 0, end: 1 },
      { type: 'list', start: 2, end: 2 },
      { type: 'list', start: 3, end: 3 }
    ])
  })
  it('breaks an indented table inside a list item out as its own table block', () => {
    const blocks = parseDoc([
      '1. step',
      '   text',
      '   | a | b |',
      '   | - | - |',
      '   | 1 | 2 |',
      '   trailing'
    ])
    expect(blocks.map((b) => b.type)).toEqual(['list', 'table', 'list'])
    const t = blocks[1]
    expect(t).toMatchObject({ type: 'table', headerLine: 2, sepLine: 3 })
    expect(t.headers).toEqual(['a', 'b'])
    expect(t.dataRows).toEqual([{ lineIdx: 4, cells: ['1', '2'] }])
    // the list segments straddle the table: text before, trailing after
    expect(blocks[0]).toMatchObject({ start: 0, end: 1 })
    expect(blocks[2]).toMatchObject({ start: 5, end: 5 })
  })
  it('never hangs on a lone non-block line (always advances)', () => {
    expect(parseDoc(['just text'])).toEqual([{ type: 'paragraph', start: 0, end: 0 }])
  })
  it('returns an empty array for empty input', () => {
    expect(parseDoc([])).toEqual([])
  })
})

describe('table cell/column edits (raw-line, byte-preserving)', () => {
  it('replaceCellInLine swaps one cell, keeps the rest and the trailing \\r', () => {
    expect(replaceCellInLine('| a | b | c |\r', 1, 'X')).toBe('| a | X | c |\r')
  })
  it('insertColumnInLine inserts a new segment at the column index', () => {
    expect(insertColumnInLine('| a | b |', 1, '')).toBe('| a |  | b |')
  })
  it('removeColumnInLine deletes the segment at the column index', () => {
    expect(removeColumnInLine('| a | b | c |', 1)).toBe('| a | c |')
  })
  it('removeColumnInLine is a no-op for an out-of-range index', () => {
    expect(removeColumnInLine('| a | b |', 9)).toBe('| a | b |')
  })
  it('buildTableRow matches the reference row pipe style and column count', () => {
    expect(buildTableRow(2, '| x | y |')).toBe('|  |  |')
    expect(buildTableRow(2, 'x | y')).toBe('  |  ')
  })
})

describe('YAML frontmatter', () => {
  it('parses a closed --- fence on line 0 as one frontmatter block', () => {
    const blocks = parseDoc(['---', 'title: x', 'tags: a, b', '---', '', 'body'])
    expect(blocks[0]).toEqual({ type: 'frontmatter', start: 0, end: 3 })
    expect(blocks[1]).toEqual({ type: 'paragraph', start: 5, end: 5 })
  })
  it('accepts the YAML "..." terminator', () => {
    expect(parseDoc(['---', 'a: 1', '...'])[0]).toEqual({ type: 'frontmatter', start: 0, end: 2 })
  })
  it('a lone --- stays an hr (no closing fence → not frontmatter)', () => {
    expect(parseDoc(['---'])[0].type).toBe('hr')
    expect(parseDoc(['---', 'title: x'])[0].type).toBe('hr')
  })
  it('a --- later in the document is still an hr', () => {
    const blocks = parseDoc(['text', '', '---'])
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'hr'])
  })
  it('renders flat key: value pairs as a definition grid', () => {
    const lines = ['---', 'title: Hello', 'draft: true', '---']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).toContain('km-frontmatter')
    expect(html).toContain('<dt>title</dt><dd>Hello</dd>')
    expect(html).toContain('<dt>draft</dt><dd>true</dd>')
  })
  it('falls back to a raw <pre> for nested/complex YAML', () => {
    const lines = ['---', 'tags:', '  - a', '---']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).toContain('km-fm-raw')
    expect(html).not.toContain('<dt>')
  })
})

describe('GFM task-list items', () => {
  it('renders [ ] / [x] items as checkboxes carrying their source line', () => {
    const lines = ['- [ ] todo', '- [x] done']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).toContain('<li class="km-task-item">')
    expect(html).toContain('data-line="0"')
    expect(html).toContain('data-line="1" checked')
    // display-only by default: disabled unless the caller opts into interaction
    expect(html.match(/disabled/g)).toHaveLength(2)
  })
  it('renders enabled checkboxes when interactiveTasks is set (not for export)', () => {
    const lines = ['- [ ] todo']
    expect(renderBlockInner(parseDoc(lines)[0], 0, lines, { interactiveTasks: true })).not.toContain(
      'disabled'
    )
    expect(
      renderBlockInner(parseDoc(lines)[0], 0, lines, { interactiveTasks: true, forExport: true })
    ).toContain('disabled')
  })
  it('leaves [x]foo (no space after the bracket) as literal text', () => {
    const lines = ['- [x]foo']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).not.toContain('km-task-cb')
    expect(html).toContain('[x]foo')
  })
  it('an empty task item still gets a checkbox', () => {
    const lines = ['- [ ]']
    expect(renderBlockInner(parseDoc(lines)[0], 0, lines, {})).toContain('km-task-cb')
  })
  it('non-task lists render exactly as before', () => {
    const lines = ['- a', '- b']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>')
  })
})

describe('extractHeadings', () => {
  it('returns headings in document order with their block index', () => {
    // Blank lines don't emit blocks, so block indices are: A=0, "text"=1, B=2.
    const blocks = parseDoc(['# A', '', 'text', '', '## B'])
    expect(extractHeadings(blocks)).toEqual([
      { level: 1, text: 'A', bi: 0 },
      { level: 2, text: 'B', bi: 2 }
    ])
  })
})
