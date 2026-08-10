---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-ARCHITECTURE-IMPORT-BOUNDARY
last_verified: 2026-08-09
---

# Architecture import boundary enforcement Test Specification

## Strategy

Parser と policy matrix は pure unit test、current source graph と package script integration は static repository check、既存 helper behavior は characterization test、product integration は build／Electron smoke で検証する。Runtime UI／IPC 変更がないため full E2E は Pull Request trigger policy に従う。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-ARCH-001 | AC-ARCH-001 | unit | `test/architecture-boundaries.test.js` | Import／export／dynamic import／require／JSX を抽出し、non-literal edge を拒否する |
| TEST-ARCH-002 | AC-ARCH-002 | unit | `test/architecture-boundaries.test.js` | 全 layer の許可／禁止 direction と managed root escape を検証する |
| TEST-ARCH-003 | AC-ARCH-003 | unit | `test/architecture-boundaries.test.js` | Electron／Node.js／Capacitor／external package の runtime owner を検証する |
| TEST-ARCH-004 | AC-ARCH-004 | unit | `test/architecture-boundaries.test.js` | Platform public entry は許可し、deep import／reverse dependency を拒否する |
| TEST-ARCH-005 | AC-ARCH-005 | unit | `test/main-helpers.test.js`<br>`src/shared/markdown.js` | Shared 移行後も Markdown helper の既存 output を維持する |
| TEST-ARCH-006 | AC-ARCH-001, AC-ARCH-002, AC-ARCH-003, AC-ARCH-004, AC-ARCH-006 | static | `scripts/check-architecture-boundaries.mjs`<br>`package.json` | Current managed source 全体が zero-waiver policy に適合し、fast gate に含まれる |
| TEST-ARCH-007 | AC-ARCH-007 | integration | `package.json`<br>`test/e2e/smoke.spec.js` | 全 product build／unit gate と built Electron startup が成功する |

## Residual Risk

- Import direction は global access、IPC payload semantics、runtime initialization order、feature-level cycle を保証しない。既存 API／type／security／E2E gate を継続する。
- Windows で local validation し、macOS／mobile runtime の直接操作は行わない。Runtime code 変更は pure helper の relocation に限定し、CI build と Electron smoke を共通 evidence とする。
