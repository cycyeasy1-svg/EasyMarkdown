---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-CODE-LINE-TABLE-EDIT
last_verified: 2026-08-15
---

# コードブロック行番号と Milkdown テーブル単一クリック編集 Test Specification

## Strategy

共通 code-line markup、空行、escaping、PDF snapshot source は unit test で固定する。Desktop Keep／Milkdown の actual rendering、clipboard、table pointer interaction は built Electron E2E で検証する。VS Code と HTML LITE は shared parser test と各 package build で integration boundary を確認する。PDF は生成物を page image へ rasterize し、gutter、連続番号、全 source line を visual QA する。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-CODETABLE-001 | AC-CODETABLE-001 | unit | `test/keep-parser.test.js` | 複数行／空行／HTML special character を semantic line row として安全に render し、DOM text に番号を持たない |
| TEST-CODETABLE-002 | AC-CODETABLE-003 | unit | `test/editor-pdf-content.test.js` | ProseMirror node source 全体から PDF code rows を再構成し preserve marker を付与する |
| TEST-CODETABLE-003 | AC-CODETABLE-003 | unit | `test/pdf-document.test.js` | PDF document に code gutter stylesheet と line counter contract を含める |
| TEST-CODETABLE-004 | AC-CODETABLE-001<br>AC-CODETABLE-002 | e2e | `test/e2e/code-table-ux.spec.js` | Keep／Milkdown の code block で行番号 gutter を表示し、copy text に番号を混入しない |
| TEST-CODETABLE-005 | AC-CODETABLE-004 | e2e | `test/e2e/code-table-ux.spec.js` | Milkdown table cell の single click 後に入力し、source へ即時反映する |
| TEST-CODETABLE-006 | AC-CODETABLE-005 | e2e | `test/e2e/code-table-ux.spec.js` | Keep table の single click は非編集、Enter／double click は編集となる |
| TEST-CODETABLE-007 | AC-CODETABLE-001<br>AC-CODETABLE-003 | static | `package.json` | `quality:fast` が Desktop／Mobile／HTML LITE／VS Code build と API／architecture gate を実行する |
| TEST-CODETABLE-008 | AC-CODETABLE-003 | e2e | `test/e2e/pdf-code-lines.spec.js` | 90 行 code block の actual PDF preview を生成し artifact を保存する |
| TEST-CODETABLE-009 | AC-CODETABLE-003 | manual | 2026-08-15 temporary rasterized PDF QA image | PDF page で gutter、1〜90 の連続番号、long／off-viewport code line を確認する |

## Verification Result

- `npm run quality:fast`: PASS（617 unit tests、coverage threshold、Desktop／Mobile／HTML LITE／VS Code build を含む）
- Targeted Electron E2E: PASS（9 tests。Keep／Milkdown code line、clipboard、single-click table、PDF、HTML export、source fidelity）
- PDF visual QA: PASS（90 行 code block を 2 page へ rasterize。1〜90 の連続 gutter、45 行目の wrap、page boundary、source completeness を確認）

## Residual Risk

- CSS counter の print rendering は Electron／Chromium version に依存するため、unit test だけでなく実 PDF の rasterized image を release 前に確認する。
- Table node view は Milkdown／Crepe dependency の private class behavior に依存する。Dependency update 時は prototype patch guard と actual E2E を再検証する。
- VS Code theme token と custom Typora theme では gutter contrast に差が出る可能性があるため、番号は装飾に留め、source readability を gutter color に依存させない。
