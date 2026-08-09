---
feature_id: FD-EXAMPLE
last_verified: 2026-08-09
---

# 機能名 Test Specification

## Strategy

最小の test level で contract を固定し、platform lifecycle や UI integration だけを E2E で検証する。自動化できない項目は manual とする理由、実施条件、証跡を記載する。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-EXAMPLE-001 | AC-EXAMPLE-001 | unit | `test/example.test.js` | 正常系 contract を検証する |
| TEST-EXAMPLE-002 | AC-EXAMPLE-002 | e2e | `test/e2e/example.spec.js` | 失敗時に回復可能であることを検証する |

Level は `unit`、`integration`、`e2e`、`static`、`manual` のいずれかを使用する。複数 AC／evidence は `<br>` で区切る。manual の Evidence には実施日と証跡への参照を記載する。

## Residual Risk

- 自動化していない条件、platform 差、既知の flaky 要因を記載する。ない場合は `なし` とする。
