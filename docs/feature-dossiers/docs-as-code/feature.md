---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-DOCS-AS-CODE
title: Docs as Code quality gate
risk: L
status: verified
owner: maintainers
platforms: shared, desktop-windows, desktop-macos, mobile-ios, mobile-android, vscode, website
last_verified: 2026-08-09
adr: docs/adr/0003-document-metadata-and-local-link-gate.md
security_review: docs/security-threat-model.md
---

# Docs as Code quality gate

## Context

EasyMarkdown の `docs/` には architecture、feature、implementation note、roadmap、release、test specification が混在し、metadata の形式と有無が統一されていなかった。完了済み plan が現行 index に残り、公開状況と矛盾する mobile install 説明、存在しない相対 path もあった。文書 review が人の記憶だけに依存すると、code が正しくても contributor と利用者が古い仕様を参照する。

本変更は全 product の document workflow と CI gate に影響するため L level とする。詳細運用は [Docs as Code 運用規約](../../documentation-governance.md) を source of truth とする。

## Goal

- `docs/**/*.md` の version、status、owner、last verified を機械検査する。
- Local file／directory／heading link の破損を Pull Request で検出する。
- Architecture、feature、ADR、test evidence、release、roadmap の source of truth を一箇所で定義する。
- 完了済み plan を archive し、現行仕様と履歴を分離する。
- `docs:check` を既存 `quality:fast` に組み込む。

## Non-goal

- 外部 HTTP link を CI から巡回しない。
- 既存 document を一つの巨大な設計書へ統合しない。
- 文書内容の妥当性、日語品質、UX 判断を parser だけで判定しない。
- Runtime code、user document、session、settings、release artifact を変更しない。

## UX

Application UI の変更はない。Contributor は broken link や metadata 欠落を local／CI で即時確認でき、利用者は current document と archive を区別できる。Mobile usage と public roadmap は Product Support Matrix より強い availability を表示しない。

## Data

各 `docs/**/*.md` の先頭に `doc_version`、`doc_status`、`doc_owner`、`last_verified` を保存する。Runtime data と user document format は変更しない。Archive は Git move と metadata 更新だけで行い、履歴内容を削除しない。

## Contract

- `doc_version` は 1 以上の整数。
- `doc_status` は `active`、`template`、`archived`。
- `doc_owner` は割当済みであり、`last_verified` は有効かつ未来でない ISO date。
- Template／archive path と status は一致する。
- Local link は repository 内に存在し、Markdown heading fragment も解決できる。
- External URL、code sample、HTML comment は deterministic CI の対象外。
- `quality:fast` は `docs:check` 失敗時に停止する。

## Migration

既存 `docs/**/*.md` に document metadata を backfill する。完了済み Keep mode plan、closed issue batch、UX roadmap は content を保持したまま `docs/archive/` へ移動する。Public roadmap と mobile usage の公開表現を Product Support Matrix に合わせる。Runtime migration は不要である。

## Acceptance Criteria

### AC-DOCS-001 — 全 document の lifecycle metadata を検査する

`docs/**/*.md` のすべてに version、status、owner、last verified が存在し、型、値、path との整合を `docs:check` が検査する。

### AC-DOCS-002 — Broken local link を検出する

現行 document、root public document、VS Code document、Website document の local file／directory／Markdown heading link が解決でき、不在 target、repository 外参照、platform 固有 separator を失敗させる。Code sample と外部 URL は誤検出しない。

### AC-DOCS-003 — Source of truth を分離する

Architecture、feature、implementation note、Feature Dossier、ADR、automated test evidence、product support、release evidence、roadmap の責務と競合時の優先先が運用規約に定義される。

### AC-DOCS-004 — 完了済み plan を archive する

完了済みの Keep mode implementation plan、issue batch、UX roadmap が archive index へ移動し、archive reason と current source of truth を確認できる。

### AC-DOCS-005 — Docs check を quality gate に含める

`npm run docs:check` が単独実行でき、`quality:fast` から version／Feature Dossier check と同じ fail-closed chain で実行される。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Metadata backfill、archive、link correction、checker unit test を同一 PR に含める。Local `docs:check`／`quality:fast` と初回 GitHub Actions の成功後に P2-3 を完了とする。新規 document は merge 時点から metadata 必須とする。

## Rollback

Runtime data への影響はない。誤検出時は checker と unit test を修正し、document metadata と archive 構造は保持する。`quality:fast` から一時的に外す場合は issue に owner、理由、復帰条件を残す。Archived content を削除または旧 active path へ無条件に戻さない。

## Open Questions

- External URL の定期検査は rate limit と false positive の運用 owner を確保できた時点で別 item として検討する。
- `last_verified` の最大 age gate は、更新負荷の実績を確認するまで導入しない。
