import { describe, expect, it } from 'vitest'
import {
  pruneNavigationHistory,
  recordNavigationLocation,
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
