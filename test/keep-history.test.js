import { describe, expect, it } from 'vitest'
import {
  applyKeepHistoryEntry,
  createKeepHistoryEntry,
  createKeepHistoryPatch,
  pushKeepHistory
} from '../src/renderer/src/keep-history.js'

describe('keep history', () => {
  it('skips no-op changes', () => {
    expect(createKeepHistoryEntry(['a', 'b'], ['a', 'b'])).toBeNull()
  })

  it('stores and reverses only the changed line range', () => {
    const before = ['# title\r', '| A | B |\r', '| --- | --- |\r', '| 1 | 2 |\r', 'tail\r']
    const after = ['# title\r', '| A | B |\r', '| --- | --- |\r', '| 1 | 9 |\r', 'tail\r']
    const entry = createKeepHistoryEntry(before, after)

    expect(entry).toMatchObject({ start: 3, before: ['| 1 | 2 |\r'], after: ['| 1 | 9 |\r'] })
    expect(applyKeepHistoryEntry(before, entry, 'redo')).toEqual(after)
    expect(applyKeepHistoryEntry(after, entry, 'undo')).toEqual(before)
  })

  it('creates a direct patch without comparing the rest of a large document', () => {
    const lines = ['before', 'target', 'after']
    const entry = createKeepHistoryPatch(lines, 1, 1, ['changed'])

    expect(entry).toMatchObject({ start: 1, before: ['target'], after: ['changed'] })
    expect(applyKeepHistoryEntry(lines, entry)).toEqual(['before', 'changed', 'after'])
  })

  it('supports structural row and column-sized changes without losing CRLF markers', () => {
    const before = ['| A |\r', '| --- |\r', '| 1 |\r']
    const after = ['| A | B |\r', '| --- | --- |\r', '| 1 | 2 |\r', '| 3 | 4 |\r']
    const entry = createKeepHistoryEntry(before, after)

    expect(applyKeepHistoryEntry(before, entry)).toEqual(after)
    expect(applyKeepHistoryEntry(after, entry, 'undo')).toEqual(before)
    expect(entry.after.every((line) => line.endsWith('\r'))).toBe(true)
  })

  it('caps old entries by count and approximate changed characters', () => {
    const entries = [
      { start: 0, before: [], after: ['one'], size: 4 },
      { start: 0, before: [], after: ['two'], size: 4 },
      { start: 0, before: [], after: ['three'], size: 6 }
    ]
    let stack = []
    entries.forEach((entry) => {
      stack = pushKeepHistory(stack, entry, { maxEntries: 2, maxChars: 8 })
    })

    expect(stack).toEqual([entries[2]])
  })
})
