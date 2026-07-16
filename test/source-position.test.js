import { describe, expect, it } from 'vitest'
import {
  displayOffsetToSourceOffset,
  lineColumnAtOffset,
  lineStartOffset,
  offsetForLineColumn,
  sourceOffsetToDisplayOffset
} from '../src/renderer/src/source-position.js'

describe('source position mapping', () => {
  const lines = ['# A', 'hidden one', 'hidden two', '# B', 'visible']
  const displayLines = ['# A', '# B', 'visible']
  const visibleMap = [0, 3, 4]

  it('converts between line/column and full source offsets', () => {
    const text = lines.join('\n')
    expect(lineStartOffset(text, 3)).toBe(text.indexOf('# B'))
    expect(lineColumnAtOffset(text, text.indexOf('visible') + 3)).toEqual({ line: 4, column: 3 })
    expect(offsetForLineColumn(lines, 4, 3)).toBe(text.indexOf('visible') + 3)
  })

  it('maps visible folded offsets without losing original line positions', () => {
    const fullOffset = lines.join('\n').indexOf('visible') + 2
    const displayOffset = displayLines.join('\n').indexOf('visible') + 2
    expect(sourceOffsetToDisplayOffset(lines, displayLines, visibleMap, fullOffset)).toBe(displayOffset)
    expect(displayOffsetToSourceOffset(lines, displayLines, visibleMap, displayOffset)).toBe(fullOffset)
  })

  it('returns null for a source offset hidden by a fold', () => {
    const hiddenOffset = lines.join('\n').indexOf('hidden two')
    expect(sourceOffsetToDisplayOffset(lines, displayLines, visibleMap, hiddenOffset)).toBeNull()
  })
})
