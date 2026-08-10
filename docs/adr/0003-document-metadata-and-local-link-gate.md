---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# ADR-0003: Document 内 metadata と deterministic local link gate を採用する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-DOCS-AS-CODE`

## Context

EasyMarkdown の document は format と lifecycle が異なり、file 単体から active／template／archive、owner、検証日を判定できなかった。Central registry だけで管理すると document の move／copy 時に sidecar と内容が分離し、既存 Feature Dossier metadata と二重管理になる。一方、外部 URL を CI から巡回すると network、rate limit、地域差、認証によって product code と無関係に gate が不安定になる。

## Decision Drivers

- Document を単体で読んでも lifecycle と owner を確認できる。
- 新規 document の登録漏れを自動的に検出する。
- Linux CI と Windows local の双方で同じ結果になる。
- Code sample を broken link と誤認しない。
- Network／外部 service に依存せず fail-closed にする。
- Feature Dossier／ADR 固有 metadata と責務を混同しない。

## Considered Options

1. Metadata と link を review checklist だけで確認する。
2. `docs/registry.json` に全 metadata を集中し、Markdown 本文には持たない。
3. 各 `docs/**/*.md` に共通 front matter を置き、repository 内 local link だけを deterministic に検査する。
4. Local link と external URL の双方を CI から毎回巡回する。

## Decision

Option 3 を採用する。

- Common metadata は `doc_version`、`doc_status`、`doc_owner`、`last_verified` とする。
- `doc_status` は document lifecycle だけを表し、Feature／ADR／release の domain status は既存 field を維持する。
- `docs:check` は `docs/**/*.md` を列挙するため、central registry への手動登録を不要とする。
- Link check は local file、directory、Markdown heading anchor、repository boundary を対象とする。
- Root public document、VS Code public document、Website document も link source に含めるが、metadata 必須範囲は `docs/**/*.md` に限定する。
- Fenced／inline code と HTML comment は sample として除外する。
- External URL は CI で fetch せず、変更時 review と将来の独立 scheduled check に分離する。
- 完了済み plan は `docs/archive/` へ移動し、path と `doc_status` の一致を検査する。

## Consequences

### Positive

- Document 追加時に metadata と link error を同じ PR で検出できる。
- Central manifest の登録漏れや path drift が発生しない。
- Network failure で product CI が不安定にならない。
- Archive と current source of truth を file path から区別できる。

### Negative

- 既存 document への metadata backfill が必要である。
- External link rot は自動検出しない。
- GitHub heading slug の一部を local checker で再現する保守負荷がある。
- Document の意味的な重複と正確性は reviewer が判断する必要がある。

## Migration and Rollback

既存 `docs/**/*.md` に common front matter を追加し、完了済み plan を archive する。Broken local link と public availability 表現を同じ migration で修正する。Runtime data migration はない。Rollback 時も metadata と archive history は保持し、gate の誤検出部分だけを unit test とともに修正する。

## Validation

- Metadata、code exclusion、heading slug、missing target、repository boundary の unit test。
- Repository 全体の `npm run docs:check`。
- `npm run quality:fast` と Pull Request CI。
- Feature Dossier の AC／TEST mapping check。

## References

- [Feature Dossier](../feature-dossiers/docs-as-code/feature.md)
- [Test Specification](../feature-dossiers/docs-as-code/test-spec.md)
- [Docs as Code 運用規約](../documentation-governance.md)
- [Security Threat Model](../security-threat-model.md)
