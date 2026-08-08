import { describe, expect, it } from 'vitest'
import {
  preserveTextareaSourceEdit,
  sourceOffsetFromTextareaOffset,
  textareaOffsetFromSourceOffset
} from '../src/renderer/src/source-text-fidelity.js'

describe('source textarea fidelity', () => {
  it('preserves CRLF and BOM when a local edit is made', () => {
    const source = '\ufeffalpha\r\nbeta\r\ngamma\r\n'
    expect(preserveTextareaSourceEdit(source, '\ufeffalpha\nBETA\ngamma\n'))
      .toBe('\ufeffalpha\r\nBETA\r\ngamma\r\n')
  })

  it('preserves untouched mixed line endings', () => {
    const source = 'one\r\ntwo\nthree\r\nfour'
    expect(preserveTextareaSourceEdit(source, 'one\ntwo!\nthree\nfour'))
      .toBe('one\r\ntwo!\nthree\r\nfour')
  })

  it('uses the nearby line ending for inserted lines', () => {
    const source = 'one\r\ntwo\r\nthree'
    expect(preserveTextareaSourceEdit(source, 'one\ntwo\nextra\nthree'))
      .toBe('one\r\ntwo\r\nextra\r\nthree')
  })

  it('maps offsets between normalized textarea text and raw source', () => {
    const source = '\ufeffa\r\nb\nc\r\n'
    for (const raw of [0, 1, 2, 4, 5, 6, 7, source.length]) {
      const visible = textareaOffsetFromSourceOffset(source, raw)
      const mapped = sourceOffsetFromTextareaOffset(source, visible)
      expect(mapped).toBe(raw === 3 || raw === 8 ? raw + 1 : raw)
    }
    expect(sourceOffsetFromTextareaOffset(source, 3)).toBe(4)
    expect(textareaOffsetFromSourceOffset(source, 4)).toBe(3)
  })
})
