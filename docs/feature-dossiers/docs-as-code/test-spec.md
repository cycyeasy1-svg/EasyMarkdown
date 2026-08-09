---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-DOCS-AS-CODE
last_verified: 2026-08-09
---

# Docs as Code quality gate Test Specification

## Strategy

Metadata、link extraction、GitHub heading slug、path boundary は pure unit test で固定する。Repository 全体の current document は `docs:check` の static scan、CI integration は `quality:fast` で検証する。External network は test dependency にしない。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-DOCS-001 | AC-DOCS-001 | unit | `test/docs-check.test.js` | 必須 metadata、date、template／archive status を検証する |
| TEST-DOCS-002 | AC-DOCS-002 | unit | `test/docs-check.test.js` | Missing file／anchor を検出し、code sample と有効 link を許可する |
| TEST-DOCS-003 | AC-DOCS-003 | static | `docs/documentation-governance.md` | Document role と source of truth mapping が存在する |
| TEST-DOCS-004 | AC-DOCS-004 | static | `docs/archive/README.md` | 完了 document、archive reason、後継 source が記録される |
| TEST-DOCS-005 | AC-DOCS-005 | integration | `scripts/check-docs.mjs`<br>`package.json` | `docs:check` が repository scan を実行し `quality:fast` に含まれる |

## Residual Risk

- External site の削除、redirect、認証 wall は自動検出しない。
- GitHub heading slug の将来仕様変更は parser test と実 repository check の更新が必要である。
- Metadata の存在は内容の正確性を保証しないため、owner review と Feature Dossier の test mapping を継続する。
