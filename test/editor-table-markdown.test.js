import { describe, expect, it } from 'vitest'
import {
  isTableSeparatorLine,
  normalizeEmptyTableCells
} from '../src/renderer/src/components/editor-table-markdown.js'

describe('rich table Markdown normalization', () => {
  it('removes only generated empty-cell break placeholders', () => {
    const source = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| one | <br /> | text<br>text |',
      '| <br> | two | <br />more |'
    ].join('\n')
    expect(normalizeEmptyTableCells(source)).toBe([
      '| A | B | C |',
      '| --- | --- | --- |',
      '| one | | text<br>text |',
      '| | two | <br />more |'
    ].join('\n'))
  })

  it('does not rewrite similar HTML outside a GFM table', () => {
    const source = 'before | after\n<br />\n| not | a table |'
    expect(normalizeEmptyTableCells(source)).toBe(source)
  })

  it('recognizes aligned GFM separator rows', () => {
    expect(isTableSeparatorLine('| :--- | ---: | :---: |')).toBe(true)
    expect(isTableSeparatorLine('| Q3: | Q4: |')).toBe(false)
  })
})
