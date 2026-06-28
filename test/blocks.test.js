// Block-type lookups shared by the status bar, selection toolbar and right-click
// menu. blockById / labelForBlockId are pure table lookups; currentBlockId is
// exercised with a minimal ProseMirror-shaped selection mock.
import { describe, it, expect } from 'vitest'
import { blockById, labelForBlockId, currentBlockId } from '../src/renderer/src/blocks.js'

describe('blockById', () => {
  it('finds a known block by id', () => {
    expect(blockById('h2')).toMatchObject({ id: 'h2', name: 'heading', level: 2 })
  })
  it('returns undefined for an unknown id', () => {
    expect(blockById('nope')).toBeUndefined()
  })
})

describe('labelForBlockId', () => {
  it('uses the defined label for known blocks', () => {
    expect(labelForBlockId('paragraph')).toBe('Text')
    expect(labelForBlockId('h1')).toBe('Heading 1')
  })
  it('humanizes an unknown id (capitalize, underscores → spaces)', () => {
    expect(labelForBlockId('code_block')).toBe('Code block')
  })
  it('defaults to Text for a falsy id', () => {
    expect(labelForBlockId(null)).toBe('Text')
    expect(labelForBlockId('')).toBe('Text')
  })
})

// Minimal stand-in for a ProseMirror resolved position whose textblock is `node`.
function fakeState(node) {
  return { selection: { $from: { depth: 1, node: (d) => (d === 1 ? node : { isTextblock: false }) } } }
}

describe('currentBlockId', () => {
  it('returns hN for a heading textblock', () => {
    const node = { isTextblock: true, type: { name: 'heading' }, attrs: { level: 3 } }
    expect(currentBlockId(fakeState(node))).toBe('h3')
  })
  it('returns paragraph for a paragraph textblock', () => {
    const node = { isTextblock: true, type: { name: 'paragraph' }, attrs: {} }
    expect(currentBlockId(fakeState(node))).toBe('paragraph')
  })
  it('returns the raw type name for other textblocks', () => {
    const node = { isTextblock: true, type: { name: 'code_block' }, attrs: {} }
    expect(currentBlockId(fakeState(node))).toBe('code_block')
  })
})
