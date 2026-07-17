import { describe, expect, it } from 'vitest'
import { buildKeepReviewChanges, restoreKeepReviewChange } from '../src/renderer/src/keep-review.js'

describe('keep change review', () => {
  it('separates distant edits into independently restorable hunks', () => {
    const baseline = ['# title', '', 'first', '', 'second', '', 'tail'].join('\n')
    const current = ['# changed', '', 'first', '', 'second changed', '', 'tail'].join('\n')
    const result = buildKeepReviewChanges(baseline, current)

    expect(result.changes).toHaveLength(2)
    expect(result.changes.map((change) => change.line)).toEqual([1, 5])
    expect(restoreKeepReviewChange(current, result.changes[1])).toBe(
      ['# changed', '', 'first', '', 'second', '', 'tail'].join('\n')
    )
  })

  it('describes inserted and deleted line ranges', () => {
    const added = buildKeepReviewChanges('a\nc', 'a\nb\nc').changes[0]
    const deleted = buildKeepReviewChanges('a\nb\nc', 'a\nc').changes[0]

    expect(added).toMatchObject({ kind: 'added', currentStart: 1, before: [], after: ['b'] })
    expect(deleted).toMatchObject({ kind: 'deleted', currentStart: 1, before: ['b'], after: [] })
  })

  it('preserves CRLF markers and untouched lines during partial restore', () => {
    const baseline = '# title\r\n\r\nbefore\r\nstable\r\n'
    const current = '# changed\r\n\r\nbefore\r\nstable\r\n'
    const change = buildKeepReviewChanges(baseline, current).changes[0]

    expect(change.before).toEqual(['# title\r'])
    expect(restoreKeepReviewChange(current, change)).toBe(baseline)
  })

  it('keeps a localized edit in a large table bounded and precise', () => {
    const rows = Array.from({ length: 20_000 }, (_, index) => `| ${index} | value ${index} |`)
    const baseline = ['| id | value |', '| --- | --- |', ...rows].join('\n')
    const changedRows = [...rows]
    changedRows[15_000] = '| 15000 | changed |'
    const current = ['| id | value |', '| --- | --- |', ...changedRows].join('\n')
    const started = performance.now()
    const result = buildKeepReviewChanges(baseline, current)

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({
      currentStart: 15_002,
      before: ['| 15000 | value 15000 |'],
      after: ['| 15000 | changed |'],
      coarse: false
    })
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('falls back to one coarse hunk when a rewrite has no nearby anchor', () => {
    const baseline = Array.from({ length: 1_000 }, (_, index) => `before ${index}`).join('\n')
    const current = Array.from({ length: 1_000 }, (_, index) => `after ${index}`).join('\n')
    const result = buildKeepReviewChanges(baseline, current, { lookahead: 20 })

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].coarse).toBe(true)
    expect(result.coarse).toBe(true)
  })
})
