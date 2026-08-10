---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-DEV-WORKFLOW
last_verified: 2026-08-09
---

# Contributor workflow baseline Test Specification

## Strategy

Git path parsing、candidate selection、extension／ignore 前処理は pure unit test で固定する。実際の Prettier check／write と Git base detection は integration command、EditorConfig／PR template／DoD は static document evidence、CI integration は `quality:fast` と Pull Request Actions で検証する。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-DEV-001 | AC-DEV-001 | static | `.editorconfig`<br>`.gitattributes`<br>`.prettierrc.json`<br>`.prettierignore`<br>`package.json`<br>`test/dev-workflow-contract.test.js` | Encoding、checkout EOL、style、exact formatter、ignore contract が存在する |
| TEST-DEV-002 | AC-DEV-002 | unit | `test/format-changed.test.js` | Git NUL path、重複、unsupported／ignored／deleted file の選択を検証する |
| TEST-DEV-003 | AC-DEV-003 | integration | `scripts/format-changed.mjs`<br>`package.json` | Check mode が差分を検査し、write mode が同じ対象を修正する |
| TEST-DEV-004 | AC-DEV-004 | static | `.github/pull_request_template.md`<br>`test/dev-workflow-contract.test.js` | Risk、platform、evidence、impact、rollback、DoD の入力欄が存在する |
| TEST-DEV-005 | AC-DEV-005 | static | `docs/definition-of-done.md`<br>`CONTRIBUTING.md`<br>`AGENTS.md`<br>`test/dev-workflow-contract.test.js` | DoD source of truth と contributor／agent 導線が存在する |
| TEST-DEV-006 | AC-DEV-003, AC-DEV-005 | integration | `.github/workflows/ci.yml`<br>`package.json` | Pull Request base との差分を `quality:fast` で fail-closed に検査する |

## Residual Risk

- Format gate は supported text file と current branch diff を対象とし、未変更の既存 debt や native toolchain の style を保証しない。
- Prettier upgrade は output change を伴う可能性があるため、自動 version update だけで merge しない。
- PR template と DoD の意味的な確認は reviewer の責務であり、checkbox の存在だけでは品質を保証しない。
