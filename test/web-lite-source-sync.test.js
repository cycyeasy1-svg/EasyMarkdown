import { describe, expect, it } from 'vitest'
import {
  sourceLineForOffset,
  sourceLineForScroll,
  sourceOffsetForLine
} from '../packages/web-lite/src/source-sync.js'

describe('web-lite source scroll synchronization', () => {
  const markdown = ['# First', '', 'Paragraph', '## Second', '', 'End'].join('\n')

  it('maps source lines to stable Markdown offsets', () => {
    expect(sourceOffsetForLine(markdown, 0)).toBe(0)
    expect(sourceOffsetForLine(markdown, 3)).toBe(markdown.indexOf('## Second'))
    expect(sourceOffsetForLine(markdown, 99)).toBe(markdown.indexOf('End'))
  })

  it('maps Markdown offsets back to source lines', () => {
    expect(sourceLineForOffset(markdown, markdown.indexOf('## Second'))).toBe(3)
    expect(sourceLineForOffset(markdown, Number.NaN)).toBe(0)
    expect(sourceLineForOffset(markdown, Number.POSITIVE_INFINITY)).toBe(5)
    expect(sourceLineForOffset(markdown, markdown.length + 10)).toBe(5)
  })

  it('accounts for textarea padding when deriving the visible source line', () => {
    expect(
      sourceLineForScroll({ scrollTop: 18, lineHeight: 24, paddingTop: 18, lineCount: 6 })
    ).toBe(0)
    expect(
      sourceLineForScroll({ scrollTop: 18 + 24 * 3, lineHeight: 24, paddingTop: 18, lineCount: 6 })
    ).toBe(3)
  })

  it('clamps bottom padding and invalid metrics to the document range', () => {
    expect(
      sourceLineForScroll({ scrollTop: 10000, lineHeight: 24, paddingTop: 18, lineCount: 6 })
    ).toBe(5)
    expect(sourceLineForScroll({ scrollTop: 80, lineHeight: 0, lineCount: 6 })).toBe(0)
  })
})
