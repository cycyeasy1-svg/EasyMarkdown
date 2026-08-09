---
feature_id: FD-DIAGNOSTICS-RECOVERY
last_verified: 2026-08-09
---

# ローカル診断とセーフモード復旧 Test Specification

## Strategy

Redaction、rotation、crash-loop state、reset key、fatal classification は pure unit test で固定する。実際の Electron 起動と safe mode 表示は built application の smoke E2E で検証する。外部 network や実 user document は test data に使用しない。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-DIAG-001 | AC-DIAG-001 | unit | `test/error-boundary.test.js` | Render error で recovery UI と diagnostic event が生成される |
| TEST-DIAG-002 | AC-DIAG-002 | unit | `test/diagnostics.test.js` | Secret、content、Windows／macOS／Linux path が redaction される |
| TEST-DIAG-003 | AC-DIAG-002 | unit | `test/local-logger.test.js` | NDJSON rotation と export 前の再 redaction を検証する |
| TEST-DIAG-004 | AC-DIAG-003 | unit | `test/crash-loop.test.js` | 5 分 window、3 回 threshold、healthy reset を検証する |
| TEST-DIAG-005 | AC-DIAG-004 | unit | `test/recovery.test.js` | Session／settings の対象 key だけを削除する |
| TEST-DIAG-006 | AC-DIAG-005 | unit | `test/diagnostics.test.js` | Recoverable filesystem code と未知 fatal error を分類する |
| TEST-DIAG-007 | AC-DIAG-001<br>AC-DIAG-003 | e2e | `test/e2e/smoke.spec.js` | Built Electron が safe mode で起動し recovery surface を提供する |

## Residual Risk

- OS process crash や disk full を実機で強制する test は自動化していない。I/O failure path は unit test と failure-safe implementation で担保する。
- macOS packaged application の Gatekeeper／notarization は release verification の責務とし、本 dossier の smoke E2E 対象外とする。
