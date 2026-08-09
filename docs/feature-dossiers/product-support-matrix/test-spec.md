---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-PRODUCT-SUPPORT
last_verified: 2026-08-09
---

# Product Support Matrix と release authorization Test Specification

## Strategy

本変更は runtime behavior ではなく release／support contract を定義するため、repository 内の source of truth と相互参照を static evidence として検証する。Artifact の署名、native device smoke、Store／Marketplace publication は各 release の manual evidence で検証し、本 dossier の完了条件には含めない。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-SUPPORT-001 | AC-SUPPORT-001 | static | `docs/product-support-matrix.md` | 六つの product に baseline、tier、readiness、evidence、owner が存在する |
| TEST-SUPPORT-002 | AC-SUPPORT-002 | static | `docs/product-support-matrix.md` | 三 tier の build／test／manual smoke／signing／rollback contract が存在する |
| TEST-SUPPORT-003 | AC-SUPPORT-003 | static | `docs/release.md` | `BLOCKED`／`NOT ELIGIBLE` の official publication を禁止する authorization が存在する |
| TEST-SUPPORT-004 | AC-SUPPORT-004 | static | `docs/release-evidence/_template.md` | Release decision に必要な evidence 項目と secret 非保存規則が存在する |
| TEST-SUPPORT-005 | AC-SUPPORT-005 | static | `docs/product-support-matrix.md` | Product 固有 gate、promotion、demotion 条件が存在する |

## Residual Risk

- Static check は記述の存在を確認できるが、manual smoke や署名が実際に成功したことは release evidence の reviewer が確認する必要がある。
- Public hosting／Store／Marketplace の状態は repository だけでは継続監視できない。P2-3 以降で deploy／link check を追加するまでは product owner が release ごとに確認する。
