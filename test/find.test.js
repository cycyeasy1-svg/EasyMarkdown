// Pure find-helper logic: case-insensitive match offsets and source-line →
// block-index mapping. The DOM-highlighting helpers (CSS Custom Highlight API)
// are intentionally not covered here — they belong to the future E2E layer.
import { describe, it, expect } from 'vitest'
import { matchIndices, findMatchesInText, docBlocks, blockIndexForLine } from '../src/renderer/src/find.js'

describe('matchIndices', () => {
  it('returns all case-insensitive match offsets', () => {
    expect(matchIndices('aXaXa', 'x')).toEqual([1, 3])
    expect(matchIndices('Hello hello', 'hello')).toEqual([0, 6])
  })
  it('does not overlap matches (advances by query length)', () => {
    expect(matchIndices('aaaa', 'aa')).toEqual([0, 2])
  })
  it('returns empty for empty text or query', () => {
    expect(matchIndices('', 'x')).toEqual([])
    expect(matchIndices('abc', '')).toEqual([])
  })
})

describe('findMatchesInText', () => {
  const offsets = (result) => result.matches.map((m) => [m.index, m.length])

  it('honors case-sensitive search', () => {
    expect(offsets(findMatchesInText('Foo foo', 'foo'))).toEqual([[0, 3], [4, 3]])
    expect(offsets(findMatchesInText('Foo foo', 'foo', { caseSensitive: true }))).toEqual([[4, 3]])
  })

  it('filters whole-word matches', () => {
    expect(offsets(findMatchesInText('cat scatter cat_ cat', 'cat', { wholeWord: true }))).toEqual([[0, 3], [17, 3]])
  })

  it('supports regular expressions and reports invalid patterns', () => {
    expect(offsets(findMatchesInText('A-1 B-22', '[A-Z]-\\d+', { regex: true }))).toEqual([[0, 3], [4, 4]])
    expect(findMatchesInText('abc', '[', { regex: true })).toMatchObject({ matches: [], error: 'regex' })
  })
})

describe('docBlocks', () => {
  it('segments a document the same way keep mode renders it', () => {
    const blocks = docBlocks('# Title\n\npara line\n')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph'])
  })
})

describe('blockIndexForLine', () => {
  const content = '# Title\n\npara one\npara two\n\n## End'
  it('maps a line inside a block to that block index', () => {
    expect(blockIndexForLine(content, 1)).toEqual({ bi: 0, total: 6 }) // heading
    expect(blockIndexForLine(content, 3)).toMatchObject({ bi: 1 }) // paragraph
    expect(blockIndexForLine(content, 6)).toMatchObject({ bi: 2 }) // ## End
  })
  it('maps a blank-gap line to the next block', () => {
    expect(blockIndexForLine(content, 2)).toMatchObject({ bi: 1 })
  })
  it('clamps an out-of-range line to the last block', () => {
    expect(blockIndexForLine(content, 999)).toMatchObject({ bi: 2 })
  })
  it('returns bi -1 when there are no blocks', () => {
    expect(blockIndexForLine('', 1)).toEqual({ bi: -1, total: 1 })
  })
})
