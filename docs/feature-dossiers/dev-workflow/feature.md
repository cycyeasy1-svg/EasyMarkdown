---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-DEV-WORKFLOW
title: Contributor workflow baseline
risk: M
status: verified
owner: maintainers
platforms: shared
last_verified: 2026-08-09
adr: none
security_review: none
---

# Contributor workflow baseline

## Context

EasyMarkdown は ESLint、quality gate、Feature Dossier、Docs as Code を持つ一方、editor 間の改行／indent contract、formatter、Pull Request の入力項目、Definition of Done が分散または未定義である。`CONTRIBUTING.md` には「linter は強制されない」とする古い説明も残り、現在の CI と一致していない。

Repository 全体を一度に formatter へ通すと、機能変更と無関係な大規模 diff が生じ、review と `git blame` の価値を下げる。本変更は runtime、user data、product API を変更せず contributor workflow だけを統一するため M level とする。

## Goal

- EditorConfig と repository-local formatter config で editor 間の基本 style を一致させる。
- 新規／変更 file に formatter check を適用し、既存未整形 file の一括 rewrite を避ける。
- PR template で変更理由、risk、platform、test evidence、影響、rollback を確認できるようにする。
- Risk level に応じた Definition of Done を一つの source of truth として定義する。
- Contributor guide、local command、CI gate の説明を現行 workflow に一致させる。

## Non-goal

- Repository 全 file の一括 formatting を行わない。
- Commit message convention、release approval、branch protection を新たに強制しない。
- Pre-commit hook を導入して local commit を自動変更しない。
- Native Android／iOS project の Java、Kotlin、Swift、XML formatter を統一しない。
- Architecture import boundary は P3-2、UI 再監査は P3-3 で扱う。

## UX

Application UI の変更はない。Contributor は `npm run format` で対象 file を修正し、`npm run format:check` で CI と同じ結果を確認できる。PR 作成時は template が risk と evidence の記載を案内する。

## Data

Runtime data、session、settings、document format の変更はない。Formatter は source file だけを対象とし、package lock、generated artifact、test fixture、native project を ignore する。

## Contract

- `.editorconfig` は UTF-8、final newline、LF、space indent を基本 contract とし、`.gitattributes` は Git checkout の EOL を固定する。Markdown の trailing whitespace は hard break を保護する。
- Prettier version は `package.json`／lockfile に exact pin し、repository config を使用する。
- Format gate は Git working tree と base commit との差分から supported file を選び、`.prettierignore` を適用する。
- `quality:fast` は format error を lint／test／build 前に fail させる。
- PR template と [Definition of Done](../../definition-of-done.md) は S／M／L risk と既存 gate を参照し、別の完了基準を作らない。

## Acceptance Criteria

### AC-DEV-001 — Editor と formatter の deterministic contract を持つ

EditorConfig、Prettier config、ignore policy、exact pinned formatter が repository に存在し、OS／editor に依存せず同じ source format になる。

### AC-DEV-002 — 新規／変更 file だけを format gate にする

Working tree、staged change、branch base との差分から supported file を重複なく選択し、ignored／deleted／unsupported file を除外する。既存 repository 全体を一括 rewrite しない。

### AC-DEV-003 — Contributor が local で確認・修正できる

`npm run format:check` が未整形 file を列挙して失敗し、`npm run format` が同じ対象を修正する。`quality:fast` は check mode を実行する。

### AC-DEV-004 — PR template が review に必要な情報を案内する

PR template に概要、理由、risk level、Feature Dossier、対象 platform、test evidence、security／privacy／accessibility／performance／i18n／data 影響、rollback、DoD 確認が存在する。

### AC-DEV-005 — Risk 別 Definition of Done を一箇所で確認できる

全変更共通条件と S／M／L の追加条件、exception policy、Ready／merge 条件が document に定義され、Contributor guide、PR template、AGENTS から参照される。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

P3-1 branch 内の新規／変更 file を formatter で整形し、unit、format check、`quality:fast`、Electron smoke を確認する。初回 GitHub Actions 成功後に P3-1 を完了とする。既存 file は将来変更された時点で formatter 対象へ移行する。

## Rollback

Runtime への影響はない。Candidate selection の誤検出は unit test を追加して修正し、formatter config と EditorConfig は維持する。一時的に gate を外す場合は owner、対象 path、理由、復帰条件、期限を PR に記録する。Mass-format commit として rollback しない。

## Open Questions

- Native project formatter は各 platform の変更頻度と toolchain が安定した時点で別 item として判断する。
