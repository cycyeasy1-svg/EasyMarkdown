// Round-trip / "zero diff" invariance tests for keep mode.
//
// Keep mode's whole reason to exist is the contract in keep-parser.js's header:
// the file text (`rawLines`, split on '\n' WITH any trailing '\r' kept) is the
// single source of truth, save = `rawLines.join('\n')`, and every edit rewrites
// ONLY the lines it touches — leaving every other byte (including each line's
// CRLF/LF ending) untouched. The characterization tests in keep-parser.test.js
// lock each pure function in isolation; THESE tests lock the end-to-end promise:
//   parse/render never mutate the source, and a cell / column / row / block edit
//   leaves the non-edited region byte-for-byte identical.
// This is the contract most at risk of silently breaking under a refactor, and
// the one a per-function unit test can't see on its own.
import { describe, it, expect } from 'vitest'
import {
  renderDoc,
  parseDoc,
  toViewLines,
  replaceCellInLine,
  insertColumnInLine,
  removeColumnInLine,
  buildTableRow,
  replaceBlockLines
} from '../src/renderer/src/keep-parser.js'

// The file → rawLines split the component performs on mount (KeepEditor: rawLines
// = (initialContent || '').split('\n')), and the inverse it saves with.
const toRaw = (content) => content.split('\n')
const save = (rawLines) => rawLines.join('\n')

// A document with every block kind, available in LF and CRLF flavors so the same
// assertions run against both line-ending conventions.
const DOC_LF = [
  '# Title',
  '',
  'first para line',
  'second para line',
  '',
  '| a | b | c |',
  '| - | - | - |',
  '| 1 | 2 | 3 |',
  '| 4 | 5 | 6 |',
  '',
  '- one',
  '- two',
  '',
  '> a quote',
  ''
].join('\n')
const DOC_CRLF = DOC_LF.replace(/\n/g, '\r\n')

describe('parse / render are read-only (source is never mutated)', () => {
  for (const [label, doc] of [['LF', DOC_LF], ['CRLF', DOC_CRLF]]) {
    it(`${label}: renderDoc round-trips the source byte-for-byte`, () => {
      const rawLines = toRaw(doc)
      const before = rawLines.slice()
      const { html } = renderDoc(rawLines)
      expect(html).toBeTruthy()
      // renderDoc must not touch the array it was handed...
      expect(rawLines).toEqual(before)
      // ...and re-joining yields the original file, byte-for-byte.
      expect(save(rawLines)).toBe(doc)
    })
  }
  it('toViewLines / parseDoc do not mutate their input', () => {
    const rawLines = toRaw(DOC_CRLF)
    const before = rawLines.slice()
    const viewLines = toViewLines(rawLines)
    const viewBefore = viewLines.slice()
    parseDoc(viewLines)
    expect(rawLines).toEqual(before)
    expect(viewLines).toEqual(viewBefore)
  })
  it('preserves a missing final newline (no phantom trailing line added)', () => {
    const doc = '# A\n\nbody' // no trailing \n
    const rawLines = toRaw(doc)
    renderDoc(rawLines)
    expect(save(rawLines)).toBe(doc)
  })
  it('round-trips an empty document', () => {
    const rawLines = toRaw('')
    const { html } = renderDoc(rawLines)
    expect(html).toBe('<div class="km-empty"></div>')
    expect(save(rawLines)).toBe('')
  })
})

// Assert that two rawLines arrays differ ONLY at the given indices — every other
// line is byte-identical (the core of the zero-diff promise).
const expectOnlyChanged = (before, after, changedIdx) => {
  expect(after.length).toBe(before.length)
  before.forEach((line, i) => {
    if (changedIdx.includes(i)) return
    expect(after[i]).toBe(line)
  })
}

describe('cell edit preserves every other byte', () => {
  for (const [label, doc] of [['LF', DOC_LF], ['CRLF', DOC_CRLF]]) {
    it(`${label}: editing one cell changes only its line, keeps the line's EOL`, () => {
      const rawLines = toRaw(doc)
      const before = rawLines.slice()
      const target = 7 // the "| 1 | 2 | 3 |" data row
      const next = rawLines.slice()
      next[target] = replaceCellInLine(rawLines[target], 1, '99')
      expectOnlyChanged(before, next, [target])
      // The trailing \r (CRLF) or its absence (LF) is preserved on the edited line.
      expect(next[target].endsWith('\r')).toBe(label === 'CRLF')
      // The edit landed: column 1 now reads 99, the others are intact.
      const reparsed = parseDoc(toViewLines(next)).find((b) => b.type === 'table')
      expect(reparsed.dataRows[0].cells).toEqual(['1', '99', '3'])
    })
  }
})

describe('column insert / remove preserve every non-table byte', () => {
  it('insertColumnInLine across the table leaves outside lines identical', () => {
    const rawLines = toRaw(DOC_CRLF)
    const before = rawLines.slice()
    const tbl = parseDoc(toViewLines(rawLines)).find((b) => b.type === 'table')
    const next = rawLines.slice()
    for (let ln = tbl.start; ln <= tbl.end; ln++) {
      next[ln] = insertColumnInLine(rawLines[ln], 1, ln === tbl.sepLine ? '---' : '')
    }
    const tableIdx = []
    for (let ln = tbl.start; ln <= tbl.end; ln++) tableIdx.push(ln)
    expectOnlyChanged(before, next, tableIdx)
    next.slice(tbl.start, tbl.end + 1).forEach((l) => expect(l.endsWith('\r')).toBe(true))
    const re = parseDoc(toViewLines(next)).find((b) => b.type === 'table')
    expect(re.headers).toHaveLength(4) // a | <new> | b | c
  })
  it('removeColumnInLine across the table leaves outside lines identical', () => {
    const rawLines = toRaw(DOC_CRLF)
    const before = rawLines.slice()
    const tbl = parseDoc(toViewLines(rawLines)).find((b) => b.type === 'table')
    const next = rawLines.slice()
    const tableIdx = []
    for (let ln = tbl.start; ln <= tbl.end; ln++) {
      next[ln] = removeColumnInLine(rawLines[ln], 0)
      tableIdx.push(ln)
    }
    expectOnlyChanged(before, next, tableIdx)
    const re = parseDoc(toViewLines(next)).find((b) => b.type === 'table')
    expect(re.headers).toEqual(['b', 'c'])
  })
})

describe('row add / remove preserve every other byte', () => {
  it('inserting a blank row (buildTableRow + splice) keeps all existing lines', () => {
    const rawLines = toRaw(DOC_CRLF)
    const tbl = parseDoc(toViewLines(rawLines)).find((b) => b.type === 'table')
    const at = tbl.dataRows[0].lineIdx + 1 // after the first data row
    const row = buildTableRow(tbl.headers.length, rawLines[tbl.headerLine])
    const next = rawLines.slice()
    next.splice(at, 0, row)
    // The new row matches the table's CRLF + bordered style.
    expect(row.endsWith('\r')).toBe(true)
    expect(row).toBe('|  |  |  |\r')
    // Every original line still appears, in order, byte-identical.
    expect([...next.slice(0, at), ...next.slice(at + 1)]).toEqual(rawLines)
    const re = parseDoc(toViewLines(next)).find((b) => b.type === 'table')
    expect(re.dataRows).toHaveLength(3)
  })
  it('deleting a row (splice) keeps all remaining lines byte-identical', () => {
    const rawLines = toRaw(DOC_CRLF)
    const tbl = parseDoc(toViewLines(rawLines)).find((b) => b.type === 'table')
    const removed = tbl.dataRows[0].lineIdx
    const next = rawLines.slice()
    next.splice(removed, 1)
    const expected = rawLines.filter((_, i) => i !== removed)
    expect(next).toEqual(expected)
  })
})

describe('replaceBlockLines (block "edit source" write-back)', () => {
  it('is pure — does not mutate the input array', () => {
    const rawLines = toRaw(DOC_LF)
    const before = rawLines.slice()
    replaceBlockLines(rawLines, 2, 3, 'x')
    expect(rawLines).toEqual(before)
  })
  it('LF: replacing a paragraph leaves every outside line identical, adds no \\r', () => {
    const rawLines = toRaw(DOC_LF)
    // The two-line paragraph is blocks[1] → raw lines [2,3].
    const out = replaceBlockLines(rawLines, 2, 3, 'edited A\nedited B\nedited C')
    expect(out.length).toBe(rawLines.length + 1) // 2 lines → 3 lines
    expect(out.slice(0, 2)).toEqual(rawLines.slice(0, 2)) // heading + blank before
    expect(out.slice(5)).toEqual(rawLines.slice(4)) // everything after, intact
    out.slice(2, 5).forEach((l) => expect(l.endsWith('\r')).toBe(false))
    expect(out[2]).toBe('edited A')
  })
  it('CRLF: replacement lines inherit the block\'s \\r, outside bytes never shift', () => {
    const rawLines = toRaw(DOC_CRLF)
    const before = rawLines.slice()
    const out = replaceBlockLines(rawLines, 2, 3, 'edited A\nedited B')
    expect(out.length).toBe(rawLines.length)
    expectOnlyChanged(before, out, [2, 3])
    // Each new line picked up the CRLF the original block used.
    expect(out[2]).toBe('edited A\r')
    expect(out[3]).toBe('edited B\r')
  })
  it('strips a \\r the textarea text may carry so EOL is applied exactly once', () => {
    const rawLines = toRaw(DOC_CRLF)
    const out = replaceBlockLines(rawLines, 2, 3, 'edited A\r\nedited B')
    expect(out[2]).toBe('edited A\r') // not 'edited A\r\r'
    expect(out[3]).toBe('edited B\r')
  })
})

describe('end-to-end: a sequence of edits only touches its target lines', () => {
  it('cell edit then block edit — every untouched line stays byte-identical', () => {
    const original = toRaw(DOC_CRLF)
    let rawLines = original.slice()

    // 1) Edit the table cell on raw line 7.
    rawLines[7] = replaceCellInLine(rawLines[7], 0, '10')

    // 2) Edit the heading block (blocks[0] → raw line 0).
    rawLines = replaceBlockLines(rawLines, 0, 0, '# Renamed Title')

    // Lines neither in the cell's line nor the heading's range are untouched.
    original.forEach((line, i) => {
      if (i === 0 || i === 7) return
      expect(rawLines[i]).toBe(line)
    })
    // The whole doc still parses to the same block shape.
    const kinds = parseDoc(toViewLines(rawLines)).map((b) => b.type)
    expect(kinds).toEqual(['heading', 'paragraph', 'table', 'list', 'quote'])
    // And both edits are visible in the saved bytes.
    expect(save(rawLines)).toContain('# Renamed Title\r\n')
    expect(save(rawLines)).toContain('| 10 | 2 | 3 |\r')
  })
})
