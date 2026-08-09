import { describe, expect, it } from 'vitest'
import { parseFrontMatter, parseTestMappingRows, validateDossierTexts } from '../scripts/check-feature-dossiers.mjs'

const feature = ({ risk = 'M', extraMetadata = '', extraSections = '' } = {}) => `---
feature_id: FD-EXAMPLE
title: Example
risk: ${risk}
status: verified
owner: maintainers
platforms: shared
last_verified: 2026-08-09
${extraMetadata}---
# Example

## Context
Context.
## Goal
Goal.
## Non-goal
Non-goal.
## UX
UX.
## Data
Data.
## Contract
Contract.
${extraSections}## Acceptance Criteria
### AC-EXAMPLE-001 — Works
Expected behavior.
### AC-EXAMPLE-002 — Fails safely
Expected failure behavior.
## Test Mapping
See test-spec.md.
## Rollout
Rollout.
## Rollback
Rollback.
## Open Questions
None.
`

const testSpec = ({ rows = '' } = {}) => `---
feature_id: FD-EXAMPLE
last_verified: 2026-08-09
---
# Tests

## Test Mapping

| Test ID | AC IDs | Level | Evidence |
| --- | --- | --- | --- |
${rows || '| TEST-EXAMPLE-001 | AC-EXAMPLE-001<br>AC-EXAMPLE-002 | unit | test/example.test.js |'}
`

describe('feature dossier checks', () => {
  it('parses the constrained front matter format', () => {
    const result = parseFrontMatter(feature(), 'feature.md')
    expect(result.errors).toEqual([])
    expect(result.metadata).toMatchObject({
      feature_id: 'FD-EXAMPLE',
      risk: 'M',
      platforms: 'shared'
    })
  })

  it('parses test mapping rows and multiple AC references', () => {
    expect(parseTestMappingRows(testSpec())).toEqual([
      {
        testId: 'TEST-EXAMPLE-001',
        acIds: ['AC-EXAMPLE-001', 'AC-EXAMPLE-002'],
        level: 'unit',
        evidence: 'test/example.test.js'
      }
    ])
  })

  it('accepts a complete M-risk dossier', () => {
    const result = validateDossierTexts({ featureText: feature(), testText: testSpec() })
    expect(result.errors).toEqual([])
  })

  it('detects missing and unknown AC mappings', () => {
    const result = validateDossierTexts({
      featureText: feature(),
      testText: testSpec({
        rows: '| TEST-EXAMPLE-001 | AC-EXAMPLE-999 | unit | test/example.test.js |'
      })
    })
    expect(result.errors).toContain('test-spec.md: TEST-EXAMPLE-001 が未定義の AC-EXAMPLE-999 を参照しています')
    expect(result.errors).toContain('test-spec.md: AC-EXAMPLE-001 に対応する TEST-ID がありません')
    expect(result.errors).toContain('test-spec.md: AC-EXAMPLE-002 に対応する TEST-ID がありません')
  })

  it('requires decision, security, and migration evidence for L-risk changes', () => {
    const result = validateDossierTexts({
      featureText: feature({ risk: 'L' }),
      testText: testSpec()
    })
    expect(result.errors).toContain('feature.md: risk L には "## Migration" section が必要です')
    expect(result.errors).toContain('feature.md: risk L には metadata "adr" が必要です')
    expect(result.errors).toContain('feature.md: risk L には metadata "security_review" が必要です')
  })

  it('accepts L-risk evidence when all required fields exist', () => {
    const result = validateDossierTexts({
      featureText: feature({
        risk: 'L',
        extraMetadata: 'adr: docs/adr/0001-example.md\nsecurity_review: docs/security.md\n',
        extraSections: '## Migration\nMigration.\n'
      }),
      testText: testSpec()
    })
    expect(result.errors).toEqual([])
  })
})
