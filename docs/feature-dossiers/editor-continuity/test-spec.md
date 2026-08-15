---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-EDITOR-CONTINUITY
last_verified: 2026-08-15
---

# 編集内容・読書位置の連続性と安全なローカルリンク Test Specification

## Strategy

Path classification、dangerous extension、position schema／LRU は pure unit test で固定する。Milkdown の actual ProseMirror transaction、dirty timing、mode 切替、position restore は built Electron E2E で利用者操作として検証する。VS Code は URI resolver の unit test と package build、HTML LITE は既存 workspace containment test で platform boundary を確認する。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-EDITOR-001 | AC-EDITOR-001<br>AC-EDITOR-003 | e2e | `test/e2e/editor-continuity.spec.js` | Milkdown の高速削除／入力後に dirty、source、save が最新内容を保持する |
| TEST-EDITOR-002 | AC-EDITOR-002 | e2e | `test/e2e/editor-continuity.spec.js` | 閉じ backtick、literal run、arrow exit を actual editor で検証する |
| TEST-EDITOR-003 | AC-EDITOR-004 | unit | `test/document-positions.test.js` | Schema validation、fingerprint mismatch、bounded LRU を検証する |
| TEST-EDITOR-004 | AC-EDITOR-004 | e2e | `test/e2e/editor-continuity.spec.js` | Keep／Milkdown／source の close／reopen と application restart で position を復元する |
| TEST-EDITOR-005 | AC-EDITOR-005<br>AC-EDITOR-006 | unit | `test/local-links.test.js` | Relative／drive／UNC／file URL、fragment、dangerous type、invalid payload を検証する |
| TEST-EDITOR-006 | AC-EDITOR-005<br>AC-EDITOR-006 | e2e | `test/e2e/local-links.spec.js` | Markdown は in-app、safe attachment は trusted main 経由、危険 target は拒否される |
| TEST-EDITOR-007 | AC-EDITOR-007 | unit | `test/vscode-local-links.test.js` | VS Code resolver が local URI を扱い remote scheme を拒否する |
| TEST-EDITOR-008 | AC-EDITOR-007 | unit | `test/web-lite-files.test.js` | HTML LITE が workspace containment と relative Markdown 制約を維持する |

## Verification Result

- `npm run quality:fast`: PASS（614 unit tests、coverage threshold、Desktop／Mobile／HTML LITE／VS Code build を含む）
- Targeted Electron E2E: PASS（14 tests。editor continuity、local link、upstream priority、internal navigation、Markdown link、navigation context）
- `git diff --check`: PASS

## Residual Risk

- OS 既定 application 自体の安全性は EasyMarkdown の control 外である。EasyMarkdown は dangerous extension を拒否し、安全な file だけを OS association へ委譲する。
- Playwright の caret geometry は font／platform 差があるため、pixel 完全一致ではなく Markdown offset と可視 block の近接で判定する。
- Network share の availability／credential prompt は自動 E2E で再現せず、resolver と main-side validation を unit test する。
