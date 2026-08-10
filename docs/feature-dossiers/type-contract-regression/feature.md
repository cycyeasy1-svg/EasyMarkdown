---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-TYPE-CONTRACT-REGRESSION
title: Boundary type and regression quality gates
risk: L
status: verified
owner: maintainers
platforms: shared, desktop-windows, desktop-macos, mobile-ios, mobile-android, vscode
last_verified: 2026-08-09
adr: docs/adr/0004-boundary-first-quality-gates.md
security_review: docs/security-threat-model.md
---

# Boundary type and regression quality gates

## Context

EasyMarkdown は build、lint、unit、Electron E2E を持つ一方、Desktop preload と Capacitor shim の API shape、locale key、coverage、accessibility、dependency vulnerability の回帰を個別 review に依存していた。既存 JavaScript 全体を一括 TypeScript 化すると巨大 module の移行 risk と review noise が大きく、現在の段階的改善方針にも反する。

本変更は Desktop／Mobile 共通 API、session／settings boundary、CI／release dependency、app chrome に影響するため L level とする。運用 contract は [型・契約・回帰 Quality Gate 運用規約](../../quality-gates.md) を source of truth とする。

## Goal

- API、session、settings 等の boundary から JSDoc `checkJs` を導入する。
- Desktop／Mobile の API と capability を一つの contract で検証する。
- Locale key／placeholder、unit coverage、startup accessibility、dependency audit の no-regression gate を追加する。
- Local、Pull Request、main、release の gate dependency を明示する。
- 全面 TypeScript 化せず、変更対象から保護範囲を拡張できる運用を定義する。

## Non-goal

- `App.jsx`、`src/main/index.js`、全 component を一括 TypeScript 化しない。
- Coverage 100% や数値だけを目的に、Electron／DOM を不自然な unit test へ移さない。
- 既存 dependency vulnerability を本 PR ですべて major upgrade して解消しない。
- Milkdown／user document 全体の accessibility 適合を本 startup smoke だけで宣言しない。
- Product Support Matrix の release readiness を build／audit 成功だけで変更しない。

## UX

利用者向け機能 flow は変更しない。Axe smoke で検出した app chrome の contrast と status dialog label を修正し、startup shell の重大な accessibility 回帰を防止する。Editor／document accessibility は残存 scope として明記する。

## Data

Session と settings の保存 key／JSON shape は変更せず、dependency-free module と JSDoc contract へ既存処理を移動する。Coverage artifact は `coverage/` に生成し Git 管理しない。Dependency baseline は advisory 本文や credential を保存せず severity 件数だけを repository に記録する。

## Contract

- `src/shared/api-contract.js` が core method、17 capability、Desktop／Mobile profile の source of truth となる。
- Capability は全 platform が boolean を明示し、`true` の場合だけ対応 method を必須とする。
- Desktop preload と Capacitor shim は static shape check と runtime assertion の双方を通す。
- English locale を canonical key set とし、全 locale の key と placeholder を一致させる。
- Coverage と dependency audit は committed baseline より悪化した場合に fail-closed とする。
- Startup app chrome で axe `serious`／`critical` violation を許可しない。

## Migration

既存 session helper を `paths.js` から `session.js` へ移し、`paths.js` は compatibility re-export を維持する。既存 import は段階的に直接 boundary module へ切り替える。Desktop／Mobile の incomplete capability object を共通 profile に置換するが、既存利用可能機能を無効化しない。User data migration は不要である。

## Acceptance Criteria

### AC-QG-001 — Boundary module を type check する

API、i18n contract、session、settings、既存抽出 module が JSDoc `checkJs` の対象となり、`npm run type:check` が type error を fail させる。

### AC-QG-002 — Desktop／Mobile API conformance を保証する

Desktop preload と Capacitor shim が全 capability を boolean で宣言し、core method と有効 capability の method を static／runtime／unit test で検証する。

### AC-QG-003 — Locale key と placeholder の parity を保証する

English を基準に全 locale の missing／extra key、非 string value、interpolation placeholder mismatch を検出する。

### AC-QG-004 — Unit coverage の no-regression floor を設ける

Pure logic の statements、branches、functions、lines に固定 threshold を設定し、`quality:fast` で下回った変更を失敗させる。

### AC-QG-005 — Startup app chrome の重大 accessibility 回帰を検出する

Built Electron app の startup shell を axe で走査し、rule を無効化せず `serious`／`critical` violation を失敗させる。

### AC-QG-006 — Dependency vulnerability の増加を block する

Root と VS Code extension の lockfile audit を severity 別 committed baseline と比較し、増加または audit 実行不能を CI／release で block する。Baseline は既知 vulnerability の waiver と扱わない。

### AC-QG-007 — Gate の責務と変更手順を一箇所で確認できる

各 command、scope、threshold、残存 risk、baseline 更新／rollback policy が source-of-truth document と AGENTS quick reference に記載される。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Contract／unit／static check を先に local `quality:fast` へ導入し、dependency scan は network dependency を分離した CI／release job とする。Built Electron smoke を local と Pull Request で確認し、初回 GitHub Actions 成功後に roadmap P2-4 を完了とする。

## Rollback

Runtime regression 時は shared profile と両 adapter を同じ commit で戻し、`paths.js` compatibility re-export を維持する。Checker 誤検出は再現 test とともに修正する。Coverage threshold または dependency baseline を緩和する場合は理由、owner、代替 evidence、復帰条件を明記し、gate 自体を無条件に削除しない。

## Open Questions

- Editor／user document 領域の accessibility gate は、Milkdown semantics と document content を分離できる専用 scope で追加する。
- 既存 root critical／high dependency debt は runtime reachability と major upgrade compatibility を調査する別 batch で削減する。
