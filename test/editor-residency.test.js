import { describe, expect, it } from 'vitest'
import {
  MAX_IDLE_KEEP_EDITORS,
  planEditorResidency,
  sameEditorIdSet
} from '../src/renderer/src/editor-residency.js'

const tab = (id, overrides = {}) => ({
  id,
  content: `content-${id}`,
  savedContent: `content-${id}`,
  ...overrides
})

describe('planEditorResidency', () => {
  it('keeps the active editor and the newest inactive Keep editors warm', () => {
    const result = planEditorResidency({
      mountedIds: new Set(['a', 'b', 'c', 'd', 'e']),
      tabs: ['a', 'b', 'c', 'd', 'e'].map((id) => tab(id)),
      recentIds: ['e', 'd', 'c', 'b', 'a'],
      protectedIds: ['e'],
      maxIdleKeepEditors: 2
    })

    expect([...result.residentIds]).toEqual(['c', 'd', 'e'])
    expect(result.hibernateIds).toEqual(['b', 'a'])
  })

  it('never hibernates dirty, draft, history, filtered, Milkdown, or visible editors', () => {
    const ids = ['active', 'dirty', 'draft', 'undo', 'redo', 'filtered', 'milkdown', 'safe']
    const result = planEditorResidency({
      mountedIds: new Set(ids),
      tabs: ids.map((id) => tab(id, id === 'dirty' ? { content: 'changed' } : {})),
      recentIds: ids,
      protectedIds: ['active'],
      milkdownIds: new Set(['milkdown']),
      draftIds: new Set(['draft']),
      historyById: {
        undo: { canUndo: true, canRedo: false },
        redo: { canUndo: false, canRedo: true }
      },
      filtersById: { filtered: { active: true } },
      maxIdleKeepEditors: 0
    })

    expect(result.hibernateIds).toEqual(['safe'])
    expect([...result.residentIds]).toEqual(ids.filter((id) => id !== 'safe'))
  })

  it('uses the default warm-set limit and treats unknown recency as oldest', () => {
    const ids = ['a', 'b', 'c', 'd', 'unknown']
    const result = planEditorResidency({
      mountedIds: new Set(ids),
      tabs: ids.map((id) => tab(id)),
      recentIds: ['d', 'c', 'b', 'a']
    })

    expect(MAX_IDLE_KEEP_EDITORS).toBe(3)
    expect(result.hibernateIds).toEqual(['a', 'unknown'])
  })

  it('adds a visible editor when mount registration is one render behind', () => {
    const result = planEditorResidency({
      mountedIds: new Set(['old']),
      tabs: [tab('old'), tab('active')],
      recentIds: ['active', 'old'],
      protectedIds: ['active'],
      maxIdleKeepEditors: 0
    })

    expect([...result.residentIds]).toEqual(['active'])
    expect(result.hibernateIds).toEqual(['old'])
  })
})

describe('sameEditorIdSet', () => {
  it('compares membership independently of insertion order', () => {
    expect(sameEditorIdSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameEditorIdSet(new Set(['a']), new Set(['b']))).toBe(false)
  })
})
