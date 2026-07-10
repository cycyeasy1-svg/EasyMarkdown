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
  renderDoc,
  estimateTableColumnWidths,
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
    expect(inline('`&nbsp; **x**`')).toBe('<code>&amp;nbsp; **x**</code>')
  })
  it('renders links and refuses javascript: schemes', () => {
    expect(inline('[ok](https://a.com)')).toBe(
      '<a href="https://a.com" target="_blank" rel="noopener">ok</a>'
    )
    // markdown-it's validateLink rejects the destination outright, so the whole
    // construct stays inert source text — strictly safer than the old empty href.
    expect(inline('[x](javascript:void)')).toBe('[x](javascript:void)')
  })
  it('keeps a link title and a URL containing parentheses', () => {
    expect(inline('[a](http://x "t")')).toBe(
      '<a href="http://x" title="t" target="_blank" rel="noopener">a</a>'
    )
    expect(inline('[a](http://x/(y))')).toBe(
      '<a href="http://x/(y)" target="_blank" rel="noopener">a</a>'
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
  it('refuses a javascript: image src but allows data: URLs', () => {
    expect(inline('![x](javascript:alert)')).toBe('![x](javascript:alert)')
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
    // markdown-it decodes the reference to the character itself (U+00A0), where the
    // old regex renderer re-emitted the `&nbsp;` entity. Same rendered glyph.
    expect(inline('a&nbsp;b')).toBe('a b')
    expect(inline('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  // ── syntax the hand-rolled regex renderer used to drop on the floor ──
  it('renders GFM strikethrough', () => {
    expect(inline('~~gone~~')).toBe('<s>gone</s>')
  })
  it('renders underscore emphasis (CommonMark, not just the asterisk form)', () => {
    expect(inline('_em_ and __strong__')).toBe('<em>em</em> and <strong>strong</strong>')
  })
  it('honors backslash escapes', () => {
    expect(inline('\\*not em\\*')).toBe('*not em*')
  })
  it('autolinks a bare https:// URL but leaves README.md alone', () => {
    expect(inline('see https://a.com now')).toBe(
      'see <a href="https://a.com" target="_blank" rel="noopener">https://a.com</a> now'
    )
    // `.md` is a real ccTLD — fuzzyLink would turn every filename in prose into a link.
    expect(inline('see README.md now')).toBe('see README.md now')
  })
  it('escapes raw inline HTML instead of injecting it', () => {
    expect(inline('<u>u</u> <script>x</script>')).toBe(
      '&lt;u&gt;u&lt;/u&gt; &lt;script&gt;x&lt;/script&gt;'
    )
  })
  it('unescapes a GFM-escaped pipe inside a table cell', () => {
    expect(inline('a \\| b')).toBe('a | b')
  })

  // ── ==highlight== (no spec anywhere; rules shared with the rich editor) ──
  it('renders ==text== as a yellow mark, including inside CJK prose', () => {
    expect(inline('这是==高亮==的')).toBe(
      '这是<mark class="hm-highlight hm-hl-yellow">高亮</mark>的'
    )
  })
  it('parses markup inside a highlight', () => {
    expect(inline('==**a**==')).toBe(
      '<mark class="hm-highlight hm-hl-yellow"><strong>a</strong></mark>'
    )
  })
  it('renders the colored <mark class="hm-hl-…"> form the rich editor writes', () => {
    expect(inline('<mark class="hm-hl-red">红</mark>')).toBe(
      '<mark class="hm-highlight hm-hl-red">红</mark>'
    )
  })
  it('never highlights inside a code span, or across === / CriticMarkup', () => {
    expect(inline('`==x==`')).toBe('<code>==x==</code>')
    expect(inline('=== a = b')).toBe('=== a = b')
    expect(inline('{==text==}')).toBe('{==text==}')
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
    expect(blocks).toEqual([{ type: 'list', start: 0, end: 2, loose: false }])
  })
  it('splits a numbered list into one block per top-level item (番号 granularity)', () => {
    const blocks = parseDoc(['1. first', '   - detail', '2. second', '3. third'])
    expect(blocks).toEqual([
      { type: 'list', start: 0, end: 1, loose: false },
      { type: 'list', start: 2, end: 2, loose: false },
      { type: 'list', start: 3, end: 3, loose: false }
    ])
  })
  it('marks a list loose when a blank line separates its items', () => {
    // The parse already kept the run together (continuous numbering); it just used
    // to discard the blank line, so the user saw no change at all.
    expect(parseDoc(['- a', '', '- b'])).toEqual([{ type: 'list', start: 0, end: 2, loose: true }])
    // Blank lines trailing the list are trimmed off, and are not "interior".
    expect(parseDoc(['- a', '- b', ''])).toEqual([{ type: 'list', start: 0, end: 1, loose: false }])
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

describe('table column width hints', () => {
  it('gives long multi-line cells more width than empty sibling columns', () => {
    const widths = estimateTableColumnWidths(
      ['State', 'Action', 'Placeholder'],
      [
        {
          cells: [
            '',
            'Event: screen init<br>rootDto.screen.input.afterPortfolio.longNestedValue<br>next step',
            ''
          ]
        }
      ]
    )
    expect(widths[1]).toBeGreaterThan(widths[0])
    expect(widths[1]).toBeGreaterThan(widths[2])
  })

  it('renders a colgroup and table min-width for keep-mode tables', () => {
    const lines = [
      '| State | Action | Placeholder |',
      '|---|---|---|',
      '|  | Event: screen init<br>rootDto.screen.input.afterPortfolio.longNestedValue |  |'
    ]
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, {})
    expect(html).toContain('style="--km-table-min-width:')
    expect(html).toContain('<colgroup><col style="width:')
    expect(html).toContain('</colgroup><thead>')
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

describe('loose list rendering', () => {
  const listHtml = (lines) => renderBlockInner(parseDoc(lines)[0], 0, lines, {})

  it('adds km-loose to a list whose items are separated by a blank line', () => {
    expect(listHtml(['- a', '', '- b'])).toContain('<ul class="km-loose">')
    expect(listHtml(['- a', '- b'])).toContain('<ul>')
  })
  it('leaves a nested sublist tight even inside a loose parent', () => {
    const html = listHtml(['- a', '  - x', '  - y', '', '- b'])
    expect(html).toContain('<ul class="km-loose">')
    expect(html).toContain('<li>a<ul><li>x</li>') // the sublist gets no class
  })
  it('preserves repeated blank-line counts between list items when enabled', () => {
    const lines = ['1. parent', '   - child one', '', '', '', '   - child two']
    const block = parseDoc(lines)[0]
    expect(renderBlockInner(block, 0, lines, {})).not.toContain('data-gap=')
    expect(renderBlockInner(block, 0, lines, { blankLineSpacing: true })).toContain(
      '<li data-list-gap data-gap="2" style="--km-gap:2">child two'
    )
  })
  it('localizes a single loose-list blank to the following item when exact spacing is enabled', () => {
    const lines = ['- a', '', '- b']
    const html = renderBlockInner(parseDoc(lines)[0], 0, lines, { blankLineSpacing: true })
    expect(html).not.toContain('km-loose')
    expect(html).toContain('<li data-list-gap data-gap="0" style="--km-gap:0">b')
  })
})

describe('blank-line spacing (opt-in, display only)', () => {
  const gapsOf = (lines, opts) =>
    [...renderDoc(lines, {}, opts).html.matchAll(/--km-gap:(\d+)/g)].map((m) => m[1])

  it('emits nothing when the setting is off, however many blank lines there are', () => {
    expect(gapsOf(['a', '', '', '', 'b'])).toEqual([])
  })
  it('emits nothing for the single blank line every parser needs as a separator', () => {
    expect(gapsOf(['a', '', 'b'], { blankLineSpacing: true })).toEqual([])
  })
  it('counts each blank line beyond the separator', () => {
    expect(gapsOf(['a', '', '', 'b'], { blankLineSpacing: true })).toEqual(['1'])
    expect(gapsOf(['a', '', '', '', 'b'], { blankLineSpacing: true })).toEqual(['2'])
  })
  it('measures the gap from the previous block even when that block trimmed trailing blanks', () => {
    // The list block ends at line 0; the blanks it swallowed still count.
    expect(gapsOf(['- a', '', '', '', 'p'], { blankLineSpacing: true })).toEqual(['2'])
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
