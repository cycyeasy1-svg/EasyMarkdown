import { describe, expect, it } from 'vitest'

import {
  appendLocalHistorySnapshot,
  localHistoryMetadata
} from '../src/main/local-history.js'

const snap = (id, content, reason = 'manual') => ({
  id,
  path: 'C:/docs/a.md',
  content,
  reason,
  size: content.length
})

describe('persistent local history', () => {
  it('keeps newest snapshots first and caps the record', () => {
    let record = { snapshots: [] }
    for (let index = 0; index < 4; index++) {
      record = appendLocalHistorySnapshot(
        record,
        snap(String(index), `v${index}`),
        { now: index + 1, maxEntries: 3, maxAgeMs: 100 }
      ).record
    }
    expect(record.snapshots.map((item) => item.content)).toEqual(['v3', 'v2', 'v1'])
  })

  it('deduplicates content and coalesces frequent autosaves', () => {
    const first = appendLocalHistorySnapshot(
      { snapshots: [] },
      snap('one', 'v1', 'autosave'),
      { now: 100, maxAgeMs: 1000, autosaveWindowMs: 50 }
    )
    expect(appendLocalHistorySnapshot(
      first.record,
      snap('same', 'v1', 'manual'),
      { now: 120, maxAgeMs: 1000, autosaveWindowMs: 50 }
    ).changed).toBe(false)
    expect(appendLocalHistorySnapshot(
      first.record,
      snap('two', 'v2', 'autosave'),
      { now: 120, maxAgeMs: 1000, autosaveWindowMs: 50 }
    ).changed).toBe(false)
  })

  it('drops expired snapshots and exposes metadata without content', () => {
    const result = appendLocalHistorySnapshot(
      { snapshots: [{ ...snap('old', 'secret'), createdAt: 1 }] },
      snap('new', 'current'),
      { now: 200, maxAgeMs: 50 }
    )
    expect(localHistoryMetadata(result.record)).toEqual([
      { id: 'new', createdAt: 200, reason: 'manual', size: 7 }
    ])
  })
})
