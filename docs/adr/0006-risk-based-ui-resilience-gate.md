---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# ADR-0006: Minimum window と controlled editor UI を risk-based gate で保護する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-UI-RESIDUAL-RISK`

## Context

Startup app chrome の axe smoke、responsive CSS、performance budget は存在するが、相互に独立していた。Keep document を開いた最小 window では ARIA、contrast、scrollable tab strip の問題が gate 外に残り、`perf-app` は UI selector drift で report 前に停止した。Screenshot review だけでは keyboard semantics と accessibility tree を検証できず、full visual snapshot は OS font／DPI／Chromium raster 差で継続運用が不安定になる。

一方、任意の Markdown と third-party Milkdown DOM まで一度に strict gate にすると、user content と product defect を分離できない。Windows automation だけで macOS／mobile／screen reader の release eligibility を宣言することもできない。

## Decision Drivers

- BrowserWindow が公称する minimum size を実際の product UI contract と一致させる。
- Product-owned semantics、keyboard operation、contrast を deterministic に回帰検出する。
- Existing zero-waiver quality policy を守り、axe rule disable や screenshot baseline で問題を隠さない。
- Performance budget の存在だけでなく、current UI から evidence を再生成できる状態を保つ。
- Windows automation、cross-product build、実機 release evidence の役割を混同しない。
- Quiet Typora-style の visual identity を保ち、audit を redesign batch にしない。

## Considered Options

1. Responsive／accessibility／performance を document と manual review だけで確認する。
2. Full-window screenshot snapshot を全 breakpoint／theme の primary gate にする。
3. Startup app chrome の axe scope だけを維持し、editor UI をすべて residual risk に残す。
4. Minimum-window Electron E2E、controlled Keep axe、semantic keyboard test、existing performance budget を一つの risk-based gate とし、arbitrary content／実機 boundary を明示する。

## Decision

Option 4 を採用する。

- Desktop main window の supported minimum 720×480 を built Electron app に適用し、root horizontal containment と主要 surface の到達可能性を検査する。
- Axe は rule を無効化せず、startup app chrome に加えて repository 管理の controlled Keep fixture、Settings、Help を light／dark theme で開いた app 全体の `serious`／`critical` violation を失敗させる。
- User-authored content、custom theme、Milkdown third-party DOM の全面適合はこの gate の claim に含めない。
- Scrollable tab strip は `tablist`／`tab`／`aria-selected` と roving keyboard activation を持つ。Pointer、existing Ctrl/Cmd shortcut、drag operation は維持する。
- Contrast correction は theme token を使い、active indication と quiet hierarchy を保ちながら非 hover 状態を判読可能にする。
- `perf-app`／`perf-resume` は current control contract から report を生成し、既存 budget を緩和しない。
- Mobile／VS Code は fast gate の build compatibility を維持し、safe area、software keyboard、assistive technology は Product Support Matrix と release evidence に残す。

## Consequences

### Positive

- Minimum window、keyboard、ARIA、contrast の重大 regression を Pull Request の smoke loop で検出できる。
- Controlled fixture により product-owned defect と arbitrary document content を分離できる。
- Performance selector drift が budget measurement を無効化した状態を見逃さない。
- Screenshot diff へ依存せず、theme／DPI 差に比較的強い semantic gate になる。
- Automated evidence が product release authorization ではないことを明示できる。

### Negative

- Electron smoke の起動と axe 実行が一 case 増え、CI 時間がわずかに増える。
- DOM semantics と tab keyboard pattern を UI 実装と同時に保守する必要がある。
- Controlled fixture が product UI を十分に含むよう、table／outline 等の代表構造を維持する必要がある。
- macOS／mobile／assistive technology／extreme scaling の manual evidence は引き続き必要である。

## Migration and Rollback

永続 data、IPC、file format、settings の migration はない。Regression test を先に追加し、ARIA／tab semantics、contrast、performance selector を同じ batch で修正する。Rollback は feature diff と gate document を同一 commit で revert する。Axe false positive は再現 fixture と scope を修正し、rule disable／baseline 増加では回避しない。

## Validation

- 720×480 built Electron E2E で document、Settings、Help の containment を確認する。
- Controlled Keep fixture、Settings、Help を light／dark theme で開き、app 全体を axe で検査する。
- Overflow tab の role、selected state、Arrow keyboard activation を E2E で確認する。
- `perf-app` と `perf-resume` の report／budget check を確認する。
- `quality:fast`、dependency no-regression、Electron smoke／focused E2E を実行する。
- Mobile／VS Code の build compatibility と residual real-device boundary を document review する。

## References

- [Feature Dossier](../feature-dossiers/ui-residual-risk/feature.md)
- [Test Specification](../feature-dossiers/ui-residual-risk/test-spec.md)
- [Quality Gate 運用規約](../quality-gates.md#7-accessibility-smoke)
- [Product Support Matrix](../product-support-matrix.md)
- [Security Threat Model](../security-threat-model.md)
