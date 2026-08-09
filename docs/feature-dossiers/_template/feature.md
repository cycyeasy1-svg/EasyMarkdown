---
doc_version: 1
doc_status: template
doc_owner: maintainers
feature_id: FD-EXAMPLE
title: 機能名
risk: M
status: draft
owner: unassigned
platforms: shared
last_verified: 2026-08-09
adr: none
security_review: none
---

# 機能名

> `FD-EXAMPLE` と `EXAMPLE` を機能固有の ID に置換する。L level の場合は `adr`、`security_review` と Migration section を必須とする。

## Context

利用者の問題、現状、変更が必要な理由を記載する。

## Goal

- 今回達成する利用者価値と測定可能な結果を記載する。

## Non-goal

- 今回明示的に扱わない範囲を記載する。

## UX

操作 flow、empty／loading／error／recovery state、accessibility の影響を記載する。UI 変更がない場合はその理由を記載する。

## Data

保存 data、session、settings、migration、privacy への影響を記載する。変更がない場合は `変更なし` とする。

## Contract

API、IPC、file format、event、platform adapter への影響を記載する。変更がない場合は `変更なし` とする。

## Migration

L level の data／contract 移行方法を記載する。M level では section を削除してよい。

## Acceptance Criteria

### AC-EXAMPLE-001 — 正常系の期待結果

Given／When／Then または同等に判定可能な表現で記載する。

### AC-EXAMPLE-002 — 失敗時の期待結果

Error／recovery／edge case を記載する。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

公開順序、feature flag、段階展開、monitoring、互換性を記載する。不要な場合は理由を記載する。

## Rollback

安全に戻す条件と手順、data 互換性を記載する。

## Open Questions

- 未決事項、owner、期限を記載する。ない場合は `なし` とする。
