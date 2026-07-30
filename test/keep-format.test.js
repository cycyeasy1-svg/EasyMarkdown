import { describe, expect, it } from 'vitest'
import {
  applyKeepTextFormat,
  detectKeepTextFormat,
  keepBlockSupportsFormatting,
  KEEP_TEXT_COLOR_GROUPS,
  KEEP_TEXT_COLORS
} from '../src/renderer/src/keep-format.js'

function apply(value, selected, command, option) {
  const start = value.indexOf(selected)
  return applyKeepTextFormat(value, start, start + selected.length, command, option)
}

describe('Keep textarea inline formatting', () => {
  it('wraps and unwraps bold without touching surrounding source', () => {
    const first = apply('before text after', 'text', 'bold')
    expect(first.value).toBe('before **text** after')
    expect(first.value.slice(first.selectionStart, first.selectionEnd)).toBe('text')

    const second = applyKeepTextFormat(
      first.value,
      first.selectionStart,
      first.selectionEnd,
      'bold'
    )
    expect(second.value).toBe('before text after')
  })

  it('keeps bold and italic independent when their asterisk runs are nested', () => {
    const bold = apply('text', 'text', 'bold')
    const both = applyKeepTextFormat(
      bold.value,
      bold.selectionStart,
      bold.selectionEnd,
      'italic'
    )
    expect(both.value).toBe('***text***')
    expect(detectKeepTextFormat(both.value, both.selectionStart, both.selectionEnd)).toMatchObject({
      bold: true,
      italic: true
    })

    const italicOnly = applyKeepTextFormat(
      both.value,
      both.selectionStart,
      both.selectionEnd,
      'bold'
    )
    expect(italicOnly.value).toBe('*text*')
  })

  it('formats only the non-whitespace core of a selection', () => {
    const result = apply('a  text  b', ' text ', 'strike')
    expect(result.value).toBe('a  ~~text~~  b')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('text')
  })

  it('inserts an empty pair at a collapsed caret and toggles it back off', () => {
    const first = applyKeepTextFormat('ab', 1, 1, 'underline')
    expect(first.value).toBe('a<u></u>b')
    expect(first.selectionStart).toBe(first.selectionEnd)

    const second = applyKeepTextFormat(
      first.value,
      first.selectionStart,
      first.selectionEnd,
      'underline'
    )
    expect(second.value).toBe('ab')
    expect(second.selectionStart).toBe(1)
  })

  it('uses == for normal highlights and safe HTML when the content contains =', () => {
    expect(apply('a text b', 'text', 'highlight').value).toBe('a ==text== b')
    expect(apply('a x=y b', 'x=y', 'highlight').value).toBe(
      'a <mark class="hm-hl-yellow">x=y</mark> b'
    )
  })

  it('adds, replaces, and removes a fixed text color wrapper', () => {
    const red = apply('a text b', 'text', 'color', '#d94b5b')
    expect(red.value).toBe('a <span style="color: #d94b5b">text</span> b')
    expect(detectKeepTextFormat(red.value, red.selectionStart, red.selectionEnd).color).toBe(
      '#d94b5b'
    )

    const blue = applyKeepTextFormat(
      red.value,
      red.selectionStart,
      red.selectionEnd,
      'color',
      '#3378c5'
    )
    expect(blue.value).toBe('a <span style="color: #3378c5">text</span> b')

    const plain = applyKeepTextFormat(
      blue.value,
      blue.selectionStart,
      blue.selectionEnd,
      'color',
      '#3378c5'
    )
    expect(plain.value).toBe('a text b')
  })

  it('offers grouped neutral and three-tone theme colors without changing legacy values', () => {
    expect(KEEP_TEXT_COLOR_GROUPS.map((group) => group.id)).toEqual(['neutral', 'theme'])
    expect(KEEP_TEXT_COLORS).toHaveLength(22)
    expect(KEEP_TEXT_COLORS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'red', value: '#d94b5b' }),
        expect.objectContaining({ id: 'blue', value: '#3378c5' }),
        expect.objectContaining({ id: 'gray', value: '#6b7280' }),
        expect.objectContaining({ id: 'purple-dark', value: '#5d3c80' })
      ])
    )
  })

  it('keeps Markdown delimiters outside generated HTML formatting', () => {
    const color = apply('text', 'text', 'color', '#3378c5')
    const bold = applyKeepTextFormat(
      color.value,
      color.selectionStart,
      color.selectionEnd,
      'bold'
    )
    expect(bold.value).toBe('**<span style="color: #3378c5">text</span>**')
    expect(bold.value.slice(bold.selectionStart, bold.selectionEnd)).toBe('text')

    const underline = applyKeepTextFormat(
      bold.value,
      bold.selectionStart,
      bold.selectionEnd,
      'underline'
    )
    expect(underline.value).toBe('**<u><span style="color: #3378c5">text</span></u>**')
    expect(detectKeepTextFormat(underline.value, underline.selectionStart, underline.selectionEnd))
      .toMatchObject({ bold: true, underline: true, color: '#3378c5' })
  })

  it('can remove a color explicitly with the default-color command', () => {
    const value = '<span style="color: #25845f">text</span>'
    const result = apply(value, 'text', 'color', '')
    expect(result.value).toBe('text')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('text')
  })

  it('keeps formatting active after a Windows-path backslash and restores the exact source', () => {
    const source = String.raw`E:\docs\医療\E2E仕様書.md`
    const cases = [
      ['bold', undefined, `**医療**`],
      ['italic', undefined, `*医療*`],
      ['strike', undefined, `~~医療~~`],
      ['underline', undefined, `<u>医療</u>`],
      ['highlight', undefined, `==医療==`],
      ['color', '#d94b5b', `<span style="color: #d94b5b">医療</span>`]
    ]

    for (const [command, option, wrapped] of cases) {
      const formatted = apply(source, '医療', command, option)
      expect(formatted.value).toBe(String.raw`E:\docs&#92;${wrapped}\E2E仕様書.md`)
      const restored = applyKeepTextFormat(
        formatted.value,
        formatted.selectionStart,
        formatted.selectionEnd,
        command,
        option
      )
      expect(restored.value).toBe(source)
    }
  })

  it('transfers the path-boundary escape while nested formats are removed', () => {
    const source = String.raw`E:\docs\医療\file.md`
    const color = apply(source, '医療', 'color', '#3378c5')
    const highlighted = applyKeepTextFormat(
      color.value,
      color.selectionStart,
      color.selectionEnd,
      'highlight'
    )
    const colorOnly = applyKeepTextFormat(
      highlighted.value,
      highlighted.selectionStart,
      highlighted.selectionEnd,
      'highlight'
    )
    expect(colorOnly.value).toBe(color.value)

    const plain = applyKeepTextFormat(
      colorOnly.value,
      colorOnly.selectionStart,
      colorOnly.selectionEnd,
      'color',
      '#3378c5'
    )
    expect(plain.value).toBe(source)
  })

  it('refuses an inline format across source lines', () => {
    const result = applyKeepTextFormat('one\ntwo', 0, 7, 'bold')
    expect(result.changed).toBe(false)
    expect(result.reason).toBe('multiline')
    expect(result.value).toBe('one\ntwo')
  })

  it('only offers the toolbar for inline-content block types', () => {
    for (const type of ['heading', 'paragraph', 'quote', 'list']) {
      expect(keepBlockSupportsFormatting(type)).toBe(true)
    }
    for (const type of ['code', 'mathblock', 'html', 'frontmatter', 'table']) {
      expect(keepBlockSupportsFormatting(type)).toBe(false)
    }
  })
})
