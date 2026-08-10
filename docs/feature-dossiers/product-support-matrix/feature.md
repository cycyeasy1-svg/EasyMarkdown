---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-PRODUCT-SUPPORT
title: Product Support Matrix と release authorization
risk: L
status: verified
owner: maintainers
platforms: shared, desktop-windows, desktop-macos, mobile-ios, mobile-android, vscode, website
last_verified: 2026-08-09
adr: docs/adr/0002-risk-based-product-support-tiers.md
security_review: docs/security-threat-model.md
---

# Product Support Matrix と release authorization

## Context

EasyMarkdown は Desktop Windows／macOS、Mobile Android／iOS、VS Code extension、Website を一つの repository で管理しているが、build 可能、version が付いている、download link があるという事実と、maintainer が互換性と配布品質を保証する範囲が区別されていなかった。公開済み GitHub Release がない状態でも README から最新版を取得できるように読めるなど、利用者向け表示と実際の release evidence に差があった。

Release／rollback と複数 platform の support promise を変更するため、本変更を L level とする。詳細 contract は [Product Support Matrix](../../product-support-matrix.md) を source of truth とする。

## Goal

- 六つの product／platform の compatibility baseline、support tier、publication readiness、owner を一箇所で確認できる。
- Stable／Beta／Experimental の各 tier が要求する build、automated test、manual smoke、signing／distribution、rollback／support を定義する。
- Release evidence が不足する product を fail-closed で official publication から除外する。
- Tier の昇格／降格条件と product 固有 release gate を明示する。

## Non-goal

- 本変更だけで installer、Store／Marketplace artifact、Website deployment を公開しない。
- Windows／macOS signing credential、Apple／Marketplace token、Android keystore を repository に追加しない。
- 各 product の build／test automation 不足をすべて本変更内で解消しない。
- Support SLA または release 日程を約束しない。

## UX

Application UI の変更はない。利用者は README から「現時点で official installer が存在しない」ことを確認でき、maintainer は matrix と release evidence から公開可否を判断する。Experimental product を download 可能と誤認させる表示は行わない。将来 Website に download UI を追加する場合は matrix の readiness と同期させる。

## Data

Runtime data、session、settings、document format の変更はない。Release evidence は repository 内の Markdown とし、source commit、artifact checksum、test result、manual smoke、rollback decision を記録する。Secret、certificate、password、token、user document は記録しない。

## Contract

- Tier は `Stable`、`Beta`、`Experimental` のいずれかとする。
- Publication readiness は `READY`、`BLOCKED`、`NOT ELIGIBLE` のいずれかとし、tier とは別に判定する。
- Beta／Stable の official publication は、対象 release の evidence が `APPROVED` になるまで禁止する。
- Experimental は official release の対象外とし、`NOT ELIGIBLE` とする。
- Product／platform、version、packaging、signing、compatibility baseline を変更する場合は matrix と関連 evidence を同時に更新する。

## Migration

既存 runtime data の migration は不要である。導入時は repository の現状から各 tier と readiness を明示し、公開実績が確認できない product を `BLOCKED` または `NOT ELIGIBLE` とする。既存の version、local build、過去の device smoke は evidence として記載できるが、それだけで official publication を許可しない。

## Acceptance Criteria

### AC-SUPPORT-001 — 全 product の現在地を宣言する

Desktop Windows／macOS、Mobile Android／iOS、VS Code extension、Website の六つについて、compatibility baseline、tier、readiness、current evidence、owner が matrix に存在する。未確定 baseline は未確定であること自体を明示する。

### AC-SUPPORT-002 — Tier の品質 contract を定義する

Stable／Beta／Experimental の各 tier に対して、build、automated test、manual smoke、signing／distribution、rollback／support の要求が判定可能な形で定義される。

### AC-SUPPORT-003 — 公開可否を fail-closed にする

必須 release evidence が不足する Beta／Stable は `BLOCKED`、Experimental は `NOT ELIGIBLE` とし、official tag／publish を許可しない。

### AC-SUPPORT-004 — Release ごとの evidence を残す

Beta／Stable を外部公開する場合、source commit、artifact／checksum、automated gate、manual smoke、signing／distribution、compatibility、rollback、final decision を template から記録し、secret を保存しない。

### AC-SUPPORT-005 — Product 固有 gate と tier 変更条件を定義する

六つの product ごとに `READY` または上位 tier へ進むための不足条件が明示され、重大な data loss、security failure、upstream EOL、rollback 不在時の publication 停止／demotion 方針が存在する。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Matrix、release evidence template、README／release 手順の順で repository に導入する。最初の GitHub Actions で `quality:fast` を確認した後に運用を有効とする。各 product は matrix の現在の readiness から開始し、実 artifact の evidence が揃った release 単位でのみ `READY` に変更する。

## Rollback

Runtime code と user data を変更しないため、文書を前 commit に戻すことで rollback できる。ただし既に承認または拒否した release evidence は監査履歴として削除せず、後続 ADR で policy を変更する。Policy rollback を理由に、署名、test、rollback evidence が不足する artifact を official と表示しない。

## Open Questions

- Website の official hosting source、deploy owner、browser baseline は P2-3 で確定する。
- iOS の Beta 昇格時期は Apple Developer signing と TestFlight 検証 owner の確保後に判断する。
