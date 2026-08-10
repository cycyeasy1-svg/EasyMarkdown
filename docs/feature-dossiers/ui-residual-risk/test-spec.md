---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-UI-RESIDUAL-RISK
last_verified: 2026-08-09
---

# UI residual risk audit gate Test Specification

## Strategy

Product behavior と automation を同じ built Electron app で検証する。Minimum bounds、tab keyboard operation、controlled Keep UI の axe check は Electron E2E、performance budget は dedicated benchmark、cross-product compatibility と document consistency は existing fast gate を用いる。Screenshot pixel matching は theme／DPI 差で fragile なため gate にせず、manual visual review の補助 evidence とする。

## Test Mapping

| Test ID | AC IDs | Level | Evidence | Scenario／期待結果 |
| --- | --- | --- | --- | --- |
| TEST-UIR-001 | AC-UIR-001 | e2e | `test/e2e/smoke.spec.js`<br>`test/e2e/helpers.js` | 720×480 で root、document、Settings、Help の containment と到達可能性を検証する |
| TEST-UIR-002 | AC-UIR-002 | e2e | `test/e2e/smoke.spec.js`<br>`test/e2e/fixtures/japanese.md` | Keep／Settings／Help を light／dark theme で検査し、app 全体の axe `serious`／`critical` violation が 0 件であることを検証する |
| TEST-UIR-003 | AC-UIR-003 | e2e | `test/e2e/smoke.spec.js`<br>`src/renderer/src/components/Tabs.jsx` | Overflow tablist の semantic state と Arrow keyboard activation を検証する |
| TEST-UIR-004 | AC-UIR-004 | integration | `scripts/perf-app.mjs`<br>`scripts/perf-resume.mjs` | Large table filter reset、resident limit、resume、hibernate restore の report と budget pass を確認する |
| TEST-UIR-005 | AC-UIR-005 | integration | `package.json`<br>`.github/workflows/ci.yml` | `quality:fast` で Desktop／Mobile／VS Code と static／unit gate を確認する |
| TEST-UIR-006 | AC-UIR-006 | static | `docs/engineering-maturity-roadmap.md`<br>`docs/quality-gates.md`<br>`docs/product-support-matrix.md` | Automated scope、残存実機 risk、release 非認可を source of truth へ記録する |

## Residual Risk

- Automated minimum-window／axe evidence は Windows CI の built Electron app で取得する。macOS window chrome と platform assistive technology は manual release evidence が必要である。
- Axe scope は controlled Keep fixture と product-owned shell を対象とし、任意 document content、custom theme、Milkdown third-party semantics の全面適合を保証しない。
- Mobile／VS Code は build compatibility と existing unit/E2E を確認するが、touch target、safe area、software keyboard、VoiceOver／TalkBack は実機未検証である。
- 720×480 は BrowserWindow の supported minimum であり、OS text scaling、display zoom、極端な custom font は別条件である。
