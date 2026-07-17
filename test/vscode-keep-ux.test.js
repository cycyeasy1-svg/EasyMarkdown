import { describe, expect, it } from 'vitest'
import {
  locateLineAnchor,
  locateBlockAnchor,
  locateInsertionAnchor,
  parseTsv,
  buildTablePastePatch
} from '../packages/vscode-extension/webview/keep-ux.js'
import { splitRow } from '../src/renderer/src/keep-parser.js'

describe('VSCode Keep draft rebasing', () => {
  it('keeps an unchanged line at its original position', () => {
    expect(locateLineAnchor(['a', '| one | two |', 'b'], '| one | two |', 1)).toBe(1)
  })

  it('follows a uniquely relocated line after unrelated external edits', () => {
    expect(locateLineAnchor(['new', 'a', '| one | two |', 'b'], '| one | two |', 1)).toBe(2)
  })

  it('rejects ambiguous duplicate line anchors', () => {
    expect(locateLineAnchor(['same', 'x', 'same'], 'same', 1)).toBe(-1)
  })

  it('uses surrounding source to avoid accepting the wrong duplicate at the old line number', () => {
    expect(
      locateLineAnchor(['x', 'same', 'before', 'same', 'after'], 'same', 1, 'before', 'after')
    ).toBe(3)
  })

  it('rebases an unchanged multi-line block and rejects duplicate blocks', () => {
    expect(locateBlockAnchor(['new', '- one', '- two', 'end'], ['- one', '- two'], 0)).toBe(1)
    expect(locateBlockAnchor(['- one', '- two', 'x', '- one', '- two'], ['- one', '- two'], 2)).toBe(-1)
  })

  it('uses block boundary context when a duplicate occupies the previous coordinate', () => {
    expect(
      locateBlockAnchor(
        ['x', '- one', '- two', 'before', '- one', '- two', 'after'],
        ['- one', '- two'],
        1,
        'before',
        'after'
      )
    ).toBe(4)
  })

  it('rebases an insertion boundary only when both surrounding lines match', () => {
    expect(locateInsertionAnchor(['new', 'before', 'after'], 'before', 'after', 1)).toBe(2)
    expect(locateInsertionAnchor(['before', 'after', 'before', 'after'], 'before', 'after', 1)).toBe(1)
    expect(locateInsertionAnchor(['before', 'after', 'before', 'after'], 'before', 'after', 2)).toBe(-1)
  })
})

describe('VSCode Keep table paste', () => {
  const source = [
    '| A | B | C |',
    '| --- | --- | --- |',
    '| a | b | c |',
    '| d | e | f |'
  ]
  const table = {
    headerLine: 0,
    headers: ['A', 'B', 'C'],
    dataRows: [{ lineIdx: 2 }, { lineIdx: 3 }]
  }

  it('parses CRLF TSV and drops one spreadsheet trailing newline', () => {
    expect(parseTsv('A\tB\r\nC\tD\r\n')).toEqual([
      ['A', 'B'],
      ['C', 'D']
    ])
  })

  it('builds a rectangular multi-row patch without mutating the source', () => {
    const original = source.slice()
    const patch = buildTablePastePatch(source, table, 1, 1, 'X\tY\nZ\tW')
    expect(source).toEqual(original)
    expect(patch).toMatchObject({ appliedRows: 2, appliedColumns: 2, clipped: false })
    expect(patch.replacements.map(({ lineIdx }) => lineIdx)).toEqual([2, 3])
    expect(splitRow(patch.replacements[0].line)).toEqual(['a', 'X', 'Y'])
    expect(splitRow(patch.replacements[1].line)).toEqual(['d', 'Z', 'W'])
  })

  it('clips cells outside the existing table and reports the applied shape', () => {
    const patch = buildTablePastePatch(source, table, 2, 2, 'X\tY\nZ\tW')
    expect(patch).toMatchObject({ appliedRows: 1, appliedColumns: 1, clipped: true })
    expect(patch.replacements).toHaveLength(1)
    expect(splitRow(patch.replacements[0].line)).toEqual(['d', 'e', 'X'])
  })
})
