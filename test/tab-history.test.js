import { describe, expect, it } from 'vitest'
import {
  CLOSED_TABS_MAX,
  buildMruTabOrder,
  createClosedTabEntry,
  insertRestoredTab,
  pushClosedTabEntries,
  removeClosedTabEntry,
  sanitizeClosedTabs,
  stepWrappedIndex,
  touchTabMru
} from '../src/renderer/src/tab-history.js'

describe('closed tab history', () => {
  it('records only saved-path tabs and preserves restoration metadata', () => {
    expect(createClosedTabEntry({ id: 'u', path: null }, 0)).toBe(null)
    expect(
      createClosedTabEntry(
        { id: 'a', path: 'C:\\docs\\a.md', title: 'a.md', pinned: true },
        2,
        { closedAt: 10, viewMode: 'source', richForced: true, discardedChanges: true }
      )
    ).toEqual({
      closedId: 'a:10',
      path: 'C:\\docs\\a.md',
      title: 'a.md',
      index: 2,
      pinned: true,
      viewMode: 'source',
      richForced: true,
      discardedChanges: true,
      closedAt: 10
    })
  })

  it('deduplicates by normalized path, caps the stack and removes exact entries', () => {
    let history = []
    for (let index = 0; index < CLOSED_TABS_MAX + 2; index++) {
      history = pushClosedTabEntries(history, [
        createClosedTabEntry(
          { id: `t${index}`, path: `C:\\docs\\${index}.md`, title: `${index}.md` },
          index,
          { closedAt: index + 1 }
        )
      ])
    }
    expect(history).toHaveLength(CLOSED_TABS_MAX)
    expect(history[0].title).toBe('2.md')

    const replacement = createClosedTabEntry(
      { id: 'again', path: 'C:/docs/2.md', title: 'two.md' },
      4,
      { closedAt: 99 }
    )
    history = pushClosedTabEntries(history, [replacement])
    expect(history.filter((entry) => entry.path.replace(/\\/g, '/') === 'C:/docs/2.md')).toHaveLength(1)
    expect(history.at(-1).title).toBe('two.md')
    expect(removeClosedTabEntry(history, replacement.closedId)).not.toContainEqual(replacement)
  })

  it('sanitizes persisted history and rejects malformed entries', () => {
    expect(sanitizeClosedTabs([null, { path: '' }, { path: '/a.md', index: -2, viewMode: 'bad' }]))
      .toEqual([
        expect.objectContaining({ path: '/a.md', index: 0, viewMode: 'keep' })
      ])
  })

  it('restores the original position without crossing the pinned boundary', () => {
    const tabs = [
      { id: 'p', pinned: true },
      { id: 'a', pinned: false },
      { id: 'c', pinned: false }
    ]
    expect(insertRestoredTab(tabs, { id: 'b', pinned: false }, 2).map((tab) => tab.id))
      .toEqual(['p', 'a', 'b', 'c'])
    expect(insertRestoredTab(tabs, { id: 'p2', pinned: true }, 99).map((tab) => tab.id))
      .toEqual(['p', 'p2', 'a', 'c'])
  })
})

describe('MRU tab switching', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('touches live ids and orders current, MRU, then untouched strip tabs', () => {
    const live = new Set(tabs.map((tab) => tab.id))
    const mru = touchTabMru(['b', 'gone', 'c'], 'a', live)
    expect(mru).toEqual(['a', 'b', 'c'])
    expect(buildMruTabOrder(tabs, mru, 'a')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('wraps selection in either direction', () => {
    expect(stepWrappedIndex(1, 1, 3)).toBe(2)
    expect(stepWrappedIndex(2, 1, 3)).toBe(0)
    expect(stepWrappedIndex(0, -1, 3)).toBe(2)
    expect(stepWrappedIndex(0, 1, 0)).toBe(-1)
  })
})
