import { describe, expect, it } from 'vitest'
import {
  findInlineMathSpans,
  inlineMathAtCaret
} from '../src/renderer/src/components/editor-inline-math.js'

describe('inline math delimiter scanning', () => {
  it('finds complete inline formulas including plain digits', () => {
    expect(findInlineMathSpans('a $123$ and $x^2$')).toEqual([
      { from: 2, to: 7, value: '123' },
      { from: 12, to: 17, value: 'x^2' }
    ])
    expect(inlineMathAtCaret('a $123$ b', 4)?.value).toBe('123')
  })

  it('ignores escaped dollars and display math delimiters', () => {
    expect(findInlineMathSpans(String.raw`\$5 and $$x$$ and $ok$`)).toEqual([
      { from: 18, to: 22, value: 'ok' }
    ])
  })

  it('does not cross a line boundary', () => {
    expect(findInlineMathSpans('$one\nstill$')).toEqual([])
  })
})
