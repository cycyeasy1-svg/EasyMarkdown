---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-WEB-LITE
last_verified: 2026-08-10
---

# Serverless Web Lite Test Specification

## Strategy

Extension／path／encoding／sort は pure unit test、shared Keep behavior は既存 characterization test、built static lifecycle は browser smoke で検証する。Existing product regression と document governance は repository-wide fast gate を使用する。Enterprise policy と network share 配置は pilot environment が確定するまで residual risk とする。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-WEBLITE-001 | AC-WEBLITE-001, AC-WEBLITE-002 | integration | `scripts/test-web-lite.mjs`<br>`packages/web-lite/build.mjs` | `file://` 起動、welcome title／action の wide・narrow layout、local asset、drag/drop open、Keep table render、source transaction、console error zero を Edge で検証する |
| TEST-WEBLITE-002 | AC-WEBLITE-003, AC-WEBLITE-004 | unit | `test/web-lite-files.test.js` | Markdown extension、path normalization／traversal reject、BOM、CRLF／LF、natural sort を検証する |
| TEST-WEBLITE-003 | AC-WEBLITE-002 | unit | `test/keep-parser.test.js`<br>`test/keep-roundtrip.test.js` | Shared Keep parse／sanitize／round-trip contract を検証する |
| TEST-WEBLITE-004 | AC-WEBLITE-005 | integration | `package.json` | `quality:fast` で API／type／i18n／format／lint／coverage と Desktop／Mobile／Web Lite／VS Code build を検証する |
| TEST-WEBLITE-005 | AC-WEBLITE-006 | static | `docs/product-support-matrix.md`<br>`packages/web-lite/README.md`<br>`docs/web-lite-security-review.md` | Experimental tier、browser baseline、non-goal、security／rollback boundary が明記される |
| TEST-WEBLITE-006 | AC-WEBLITE-007 | unit | `test/web-lite-typography.test.js` | Range normalization、Web Lite 専用 storage、CSS variable、font stack、full-width class を検証する |
| TEST-WEBLITE-007 | AC-WEBLITE-001, AC-WEBLITE-002, AC-WEBLITE-007 | integration | `scripts/test-web-lite.mjs` | Edge `file://` で typography panel の即時反映／reload persistence と Keep source transaction を検証する |
| TEST-WEBLITE-008 | AC-WEBLITE-008 | unit | `test/web-lite-status.test.js` | Folder-relative path、single-file fallback、separator normalization、document／source draft の dirty state を検証する |
| TEST-WEBLITE-009 | AC-WEBLITE-002, AC-WEBLITE-008 | integration | `scripts/test-web-lite.mjs` | Edge `file://` で path、saved／unsaved state、table filter count、status badge からの filter clear を検証する |
| TEST-WEBLITE-010 | AC-WEBLITE-009 | unit | `test/web-lite-source-sync.test.js` | Source line／offset、textarea scroll position、padding、document end clamp の mapping を検証する |
| TEST-WEBLITE-011 | AC-WEBLITE-002, AC-WEBLITE-009 | integration | `scripts/test-web-lite.mjs` | Source open 中の preview wheel scroll、source-to-preview sync、同一 button による open／close、source transaction apply を Edge `file://` で検証する |

## Residual Risk

- Folder picker／direct write の native browser dialog と permission renewal は automation で操作せず、managed Edge pilot の manual smoke が必要である。
- Network share の lock、latency、offline、concurrent write behavior は配置方式決定後に検証する。
- Chrome／Edge の enterprise policy 差と future File System Access API change は browser upgrade ごとに再確認する。
- Large document performance、Mermaid full syntax、relative image の real folder handle flow は representative document の pilot evidence を追加する。
