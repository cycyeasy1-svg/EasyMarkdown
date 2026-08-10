---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-UI-RESIDUAL-RISK
title: UI residual risk audit gate
risk: L
status: verified
owner: maintainers
platforms: shared, desktop-windows, desktop-macos, mobile-ios, mobile-android, vscode
last_verified: 2026-08-09
adr: docs/adr/0006-risk-based-ui-resilience-gate.md
security_review: docs/security-threat-model.md
---

# UI residual risk audit gate

## Context

Desktop の startup app chrome には axe smoke がある一方、Keep editor を開いた状態、最小 window、overflow した tab strip は同じ gate で検証していなかった。実測では Keep root の不正な ARIA attribute、active outline と table tool の contrast 不足、overflow tab strip の keyboard access 不足を検出した。また `perf-app` は UI selector drift により結果を出す前に停止し、performance budget が存在しても evidence を再生成できない状態だった。

P3-3 は visual redesign ではなく、既存の静かな Typora-style UI を保ったまま、再現可能な residual risk だけを `/harden`、`/optimize`、`/adapt`、`/polish` の順に閉じる。

## Goal

- Desktop の supported minimum window 720×480 で shell と主要 overlay が horizontal overflow せず操作可能であることを自動検証する。
- Controlled Keep fixture、Settings、Help の product-owned UI について、built-in light／dark theme の axe `serious`／`critical` violation を zero-waiver で失敗させる。
- Overflow tab strip を keyboard と accessibility tree から選択可能にする。
- `perf-app`／`perf-resume` が current UI contract に対して再実行でき、既存 budget を維持する。
- Desktop／Mobile／VS Code の build compatibility と、自動化していない実機境界を同じ evidence に残す。

## Non-goal

- 任意の user-authored Markdown、third-party Milkdown DOM、custom theme の WCAG 適合を宣言しない。
- Screen reader、high DPI、OS text scaling、iOS／Android 実機の release acceptance をこの Windows automation だけで代替しない。
- Product support tier、signing／notarization、Store／Marketplace eligibility を変更しない。
- 性能根拠がない bundle 分割、editor architecture 変更、visual redesign は行わない。
- 既知 dependency vulnerability は別 security batch とする。

## UX

720×480 でも tab strip は overflow affordance を保ち、selected tab を `tablist`／`tab` semantics と Arrow／Home／End keyboard operation で移動できる。Active outline は accent background を保ちながら readable text contrast にし、table tool は非 hover 時も判読可能にする。Settings／Help は viewport 内に収まり、内部 content を scroll して close／primary operation へ到達できる。

Reduced motion、coarse pointer、safe-area rule は既存 contract を維持する。UI copy と navigation hierarchy は変更しない。

## Data

変更なし。Session、settings、document、local history、userData の migration は発生しない。Test fixture と audit result に user document／absolute path を保存しない。

## Contract

IPC、preload API、file format、platform adapter contract は変更しない。Product-owned DOM に tab semantics と keyboard operation を追加し、minimum-window Electron E2E と controlled Keep axe scope を quality gate contract に追加する。Performance script は current table-filter control を利用する。

## Migration

永続 data／public API の migration は不要である。既存利用者には update 後ただちに tab semantics と contrast correction が適用される。macOS、Mobile、VS Code は data compatibility を変えず、既存 build path で regression を確認する。

## Acceptance Criteria

### AC-UIR-001 — Supported minimum window で主要 UI を操作できる

Given Desktop app を 720×480 の restore bounds で開く、When document、Settings、Help を表示する、Then root に horizontal overflow がなく、各 surface と close／primary operation が viewport 内または明示的な内部 scroll で到達できる。

### AC-UIR-002 — Controlled product UI の重大 accessibility 回帰を block する

Given repository 管理の日本語 Keep fixture、Settings、Help と built-in light／dark theme、When mounted app 全体を axe で検査する、Then rule を無効化せず `serious`／`critical` violation が 0 件である。

### AC-UIR-003 — Overflow tab strip を keyboard と accessibility tree から選択できる

Given tab strip が overflow している、When focus された tab で ArrowLeft／ArrowRight／Home／End を入力する、Then focus と selected document が同じ tab へ移り、`tablist`／`tab`／`aria-selected` が状態を表す。

### AC-UIR-004 — Performance evidence を current UI から再生成できる

Given large-table と resident-editor fixture、When `perf-app` と `perf-resume` を実行する、Then selector timeout なしで report が生成され、既存 budget check が成功する。

### AC-UIR-005 — Shared renderer の compatibility を維持する

Given UI semantics／style／test harness の変更、When fast quality gate を実行する、Then Desktop、Mobile、VS Code build、unit、lint、i18n、architecture、documentation gate が成功する。

### AC-UIR-006 — 自動化境界と release 非認可を明示する

Given Windows 上の automated evidence、When P3-3 を完了判定する、Then macOS／mobile 実機、assistive technology、arbitrary document／custom theme の残存 risk と Product Support Matrix を変更しないことが記録される。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Feature flag は使用しない。Regression test、DOM semantics、contrast correction、performance selector correction を同一 PR で導入し、Pull Request の Electron smoke と fast quality gate を先に成功させる。Merge 後も product tier は現行 Product Support Matrix のままとし、official publication の release evidence には流用しない。

## Rollback

Accessibility semantics／style／test／performance selector／document を同一 commit 単位で revert できる。Data migration はない。Gate 自体の false positive は fixture と rule scope を再現して修正し、baseline、rule disable、無期限 ignore では回避しない。

## Verification Evidence

- `npm run test:e2e:smoke:built`: 720×480 の Keep／Settings／Help containment、tab keyboard operation、light／dark の axe zero-waiver check を含む 7／7 成功。
- `npm run test:e2e:built`: clipboard、editor、navigation、table、history、minimum-window smoke を含む 103／103 成功。
- `node scripts/perf-app.mjs --runs=1`: current table-filter selector で report を完走し、31／31 budget 成功。First rows 105.7 ms、table open 1255.8 ms、table task 1059.3 ms、max long task 195 ms、TBT 225 ms、cell edit 211.1 ms。閾値は変更していない。
- `node scripts/perf-resume.mjs --runs=1`: 5／5 budget 成功。Resident Keep editor 4、DOM node 16,424、resume 48.4 ms、hibernate reopen 192.6 ms、scroll ratio 0.701。
- `npm run quality:fast`: 81 files／579 unit tests、coverage statements 73.59%／branches 76.52%／functions 74.57%／lines 73.57%、Desktop／Mobile／VS Code build を含む全 gate 成功。
- `npm run dependencies:check`: root／VS Code とも 2026-08-09 baseline 比 no-regression。既知 vulnerability は本 dossier の non-goal とし、release eligibility の根拠にはしない。
- GitHub Actions CI Run #65（PR #8）: Fast quality gate／Dependency baseline scan／Electron smoke E2E 成功。Draft PR 方針どおり full E2E は skip、local full E2E は 103／103 成功。
- Windows automation では macOS／mobile 実機、VoiceOver／Narrator／TalkBack、OS text scaling、任意 Markdown／custom theme を検証していない。Product Support Matrix と official publication eligibility は変更しない。

## Open Questions

- macOS VoiceOver、Windows Narrator、iOS VoiceOver、Android TalkBack の product-specific evidence は各 release owner が official publication 前に作成する。
- Arbitrary Markdown と Milkdown third-party DOM の accessibility scope は editor 専用 dossier で段階導入する。
