import { describe, expect, it } from 'vitest'
import {
  isTableSeparatorLine,
  normalizeEmptyTableCells,
  normalizeEmptyTextBlocks,
  normalizeMilkdownMarkdown
} from '../src/renderer/src/components/editor-table-markdown.js'

describe('rich table Markdown normalization', () => {
  it('removes only generated empty-cell break placeholders', () => {
    const source = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| one | <br /> | text<br>text |',
      '| <br> | two | <br />more |'
    ].join('\n')
    expect(normalizeEmptyTableCells(source)).toBe(
      [
        '| A | B | C |',
        '| --- | --- | --- |',
        '| one | | text<br>text |',
        '| | two | <br />more |'
      ].join('\n')
    )
  })

  it('does not rewrite similar HTML outside a GFM table', () => {
    const source = 'before | after\n<br />\n| not | a table |'
    expect(normalizeEmptyTableCells(source)).toBe(source)
  })

  it('recognizes aligned GFM separator rows', () => {
    expect(isTableSeparatorLine('| :--- | ---: | :---: |')).toBe(true)
    expect(isTableSeparatorLine('| Q3: | Q4: |')).toBe(false)
  })

  it('removes only whole-line paragraph and blockquote placeholders', () => {
    expect(normalizeEmptyTextBlocks('# Title\n\n<br />\n\n> <br />\n\ntext<br />text\n')).toBe(
      '# Title\n\n\n\n>\n\ntext<br />text\n'
    )
  })

  it('combines text-block and table-cell normalization', () => {
    expect(normalizeMilkdownMarkdown('| A | B |\n| --- | --- |\n| <br /> | x |\n\n<br />')).toBe(
      '| A | B |\n| --- | --- |\n| | x |\n\n'
    )
  })
})
