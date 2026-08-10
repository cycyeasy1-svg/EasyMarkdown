import { describe, expect, it } from 'vitest'
import {
  compareAuditCounts,
  normalizeAuditCounts,
  validateAuditBaseline,
  validateAuditCounts
} from '../scripts/check-dependencies.mjs'

describe('dependency audit baseline', () => {
  it('normalizes missing counts and recomputes total', () => {
    expect(normalizeAuditCounts({ high: 2, total: 99 })).toEqual({
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 0,
      total: 2
    })
  })

  it('allows equal or lower severity counts', () => {
    const result = compareAuditCounts(
      { moderate: 1, high: 2, critical: 0 },
      { moderate: 2, high: 2, critical: 1 },
      'root'
    )
    expect(result.errors).toEqual([])
  })

  it('fails each severity that exceeds its baseline', () => {
    const result = compareAuditCounts(
      { moderate: 3, high: 3, critical: 1 },
      { moderate: 2, high: 2, critical: 1 },
      'root'
    )
    expect(result.errors).toEqual([
      'root: moderate vulnerability が baseline 2 から 3 へ増加しました',
      'root: high vulnerability が baseline 2 から 3 へ増加しました'
    ])
  })

  it('does not hide a severity escalation behind a lower total', () => {
    const result = compareAuditCounts(
      { moderate: 0, high: 0, critical: 2 },
      { moderate: 10, high: 10, critical: 1 },
      'root'
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('critical vulnerability')
  })

  it('rejects malformed or internally inconsistent committed baselines', () => {
    expect(
      validateAuditCounts({ info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 99 })
    ).toEqual(['audit baseline: total 99 は severity 合計 1 と一致しません'])

    expect(
      validateAuditBaseline({
        schemaVersion: 1,
        lastVerified: '2026-08-09',
        projects: {
          root: {
            path: '.',
            vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 }
          }
        }
      })
    ).toEqual([])
  })
})
