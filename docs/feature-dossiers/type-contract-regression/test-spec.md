---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-TYPE-CONTRACT-REGRESSION
last_verified: 2026-08-09
---

# Boundary type and regression quality gates Test Specification

## Strategy

Contract validator と audit／i18n comparison は pure unit test、公開 object shape と `checkJs` は static check、coverage と workflow chain は integration、実際の app chrome accessibility は built Electron E2E で検証する。Network dependency は local fast gate から分離するが、CI／release の後続 job は dependency scan 成功を必須とする。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-QG-001 | AC-QG-001 | static | `tsconfig.contracts.json`<br>`package.json` | 選定 boundary を `tsc --checkJs --noEmit` で検証する |
| TEST-QG-002 | AC-QG-002 | unit | `test/api-contract.test.js` | Core method、全 capability、`true` capability の必須 method を検証する |
| TEST-QG-003 | AC-QG-002 | static | `test/api-contract-static.test.js`<br>`scripts/check-api-contract.mjs` | Desktop／Mobile の公開 key と runtime assertion を解析する |
| TEST-QG-004 | AC-QG-003 | unit | `test/i18n-contract.test.js` | Missing／extra key、type、placeholder mismatch を検出する |
| TEST-QG-005 | AC-QG-003 | static | `scripts/check-i18n.mjs` | Current 全 locale を English key set と比較する |
| TEST-QG-006 | AC-QG-004 | integration | `vitest.config.mjs`<br>`package.json` | Coverage threshold 未満で command を失敗させる |
| TEST-QG-007 | AC-QG-005 | e2e | `test/e2e/smoke.spec.js` | Built app chrome に axe serious／critical violation がない |
| TEST-QG-008 | AC-QG-006 | unit | `test/dependency-audit.test.js` | Severity 増加、audit error、baseline inconsistency を検出する |
| TEST-QG-009 | AC-QG-006, AC-QG-007 | integration | `scripts/check-dependencies.mjs`<br>`.github/workflows/ci.yml`<br>`.github/workflows/release.yml`<br>`docs/quality-gates.md` | Root／VS Code audit と後続 job dependency、運用 source of truth を検証する |

## Residual Risk

- Static API parser は明示 object literal を contract とする。Computed key／spread へ変更する場合は parser を弱めず、同等に決定的な公開 shape evidence を追加する必要がある。
- Axe smoke は startup app chrome のみを対象とし、Milkdown editor、任意 user document、screen reader の end-to-end 操作を保証しない。
- Dependency 件数 baseline は vulnerability の到達可能性、exploitability、修正済み判定を表さない。
- Coverage は未実行 platform lifecycle と manual product evidence を代替しない。
