import { describe, expect, it } from 'vitest'
import {
  haveSameHeadingParent,
  headingSectionRange,
  moveHeadingSection
} from '../src/renderer/src/outline-reorder.js'
import { parseHeadingDetails } from '../src/renderer/src/outline-model.js'

describe('outline section reordering', () => {
  it('moves a sibling heading together with all descendants', () => {
    const source = [
      '# Root',
      '',
      '## Alpha',
      'alpha',
      '### Alpha child',
      'child',
      '## Beta',
      'beta',
      ''
    ].join('\n')

    expect(moveHeadingSection(source, 1, 3, 'after')).toBe([
      '# Root',
      '',
      '## Beta',
      'beta',
      '## Alpha',
      'alpha',
      '### Alpha child',
      'child',
      ''
    ].join('\n'))
  })

  it('rejects hierarchy-changing moves', () => {
    const source = '# A\n## A1\n### A1a\n# B\n## B1\n'
    const headings = parseHeadingDetails(source)
    expect(haveSameHeadingParent(headings, 1, 2)).toBe(false)
    expect(haveSameHeadingParent(headings, 1, 4)).toBe(false)
    expect(moveHeadingSection(source, 1, 4, 'before')).toBeNull()
  })

  it('supports Setext and HTML headings and preserves CRLF', () => {
    const source = 'Root\r\n====\r\n\r\nFirst\r\n-----\r\none\r\n<h2>Second</h2>\r\ntwo'
    const headings = parseHeadingDetails(source)
    expect(headingSectionRange(source, headings, 1)).toEqual({
      start: source.indexOf('First'),
      end: source.indexOf('<h2>')
    })
    const moved = moveHeadingSection(source, 2, 1, 'before')
    expect(moved).toBe('Root\r\n====\r\n\r\n<h2>Second</h2>\r\ntwo\r\nFirst\r\n-----\r\none\r\n')
    expect(moved).not.toContain('\nFirst\n')
  })
})
