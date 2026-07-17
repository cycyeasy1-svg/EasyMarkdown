import { describe, expect, it } from 'vitest'
import {
  pruneNavigationHistory,
  recordNavigationLocation,
  sanitizeNavigationContext,
  sameNavigationLocation,
  stepNavigationHistory
} from '../src/renderer/src/navigation-history.js'

const loc = (tabId, rawOffset, sourceMode = false) => ({ tabId, rawOffset, sourceMode })

describe('navigation history', () => {
  it('compares tab, offset, and editor view', () => {
    expect(sameNavigationLocation(loc('a', 10), loc('a', 10))).toBe(true)
    expect(sameNavigationLocation(loc('a', 10), loc('a', 10, true))).toBe(false)
    expect(sameNavigationLocation(loc('a', 10), loc('b', 10))).toBe(false)
  })

  it('records jumps, deduplicates the current location, and clears forward history', () => {
    let state = { back: [], forward: [loc('future', 1)] }
    state = recordNavigationLocation(state, loc('a', 10))
    state = recordNavigationLocation(state, loc('a', 10))

    expect(state).toEqual({ back: [loc('a', 10)], forward: [] })
  })

  it('refreshes bounded context without duplicating the same location', () => {
    let state = recordNavigationLocation(
      { back: [], forward: [] },
      { ...loc('a', 10), context: { table: { ti: 1, scrollLeft: 20 } } }
    )
    state = recordNavigationLocation(state, {
      ...loc('a', 10),
      context: { table: { ti: 1, scrollLeft: 80 } }
    })
    expect(state.back).toHaveLength(1)
    expect(state.back[0].context.table.scrollLeft).toBe(80)
  })

  it('caps navigation context state and normalizes source selections', () => {
    const context = sanitizeNavigationContext({
      sourceSelection: { start: 9, end: 2 },
      collapsed: Array.from({ length: 80 }, (_, i) => `2:heading-${i}`),
      table: {
        ti: 2,
        scrollLeft: 123,
        filters: [{
          column: 1,
          excluded: Array.from({ length: 300 }, (_, i) => `value-${i}`)
        }]
      }
    })
    expect(context.sourceSelection).toEqual({ start: 2, end: 9 })
    expect(context.collapsed).toHaveLength(50)
    expect(context.table.filters[0].excluded).toHaveLength(200)
  })

  it('steps backward and forward while preserving the location being left', () => {
    const state = { back: [loc('a', 10), loc('b', 20)], forward: [] }
    const back = stepNavigationHistory(state, loc('c', 30), 'back')
    expect(back.target).toEqual(loc('b', 20))
    expect(back.state).toEqual({ back: [loc('a', 10)], forward: [loc('c', 30)] })

    const forward = stepNavigationHistory(back.state, back.target, 'forward')
    expect(forward.target).toEqual(loc('c', 30))
    expect(forward.state).toEqual({ back: [loc('a', 10), loc('b', 20)], forward: [] })
  })

  it('drops locations belonging to closed tabs', () => {
    expect(pruneNavigationHistory(
      { back: [loc('a', 1), loc('b', 2)], forward: [loc('c', 3)] },
      new Set(['b', 'c'])
    )).toEqual({ back: [loc('b', 2)], forward: [loc('c', 3)] })
  })
})
