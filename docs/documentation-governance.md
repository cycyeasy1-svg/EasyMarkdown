---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# Docs as Code 運用規約

## 1. 目的

本書は、EasyMarkdown の document を code と同じ変更・review・CI 対象として扱うための source of truth である。文書数を増やすことではなく、現行仕様、設計理由、受入条件、test evidence、履歴の責務を分離し、古い計画や壊れた link を利用者と contributor に提示しないことを目的とする。

## 2. Document metadata

`docs/**/*.md` は、先頭に次の front matter を持つ。

```yaml
---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---
```

| Field | Contract |
| --- | --- |
| `doc_version` | 1 以上の整数。Document の責務、主要 contract、構造を変更したときに increment する。誤字修正だけでは変更しない |
| `doc_status` | `active`、`template`、`archived` のいずれか。`_template`／`0000-template` は `template`、`docs/archive/` の履歴 document は `archived` とする |
| `doc_owner` | 内容の review と更新判断を担当する owner。`unassigned` は許可しない |
| `last_verified` | 内容と現行 code／workflow の一致を最後に確認した日。`YYYY-MM-DD` 形式とし、未来日は許可しない |

Feature Dossier の `status`、ADR の `Status`、release evidence の `Decision` は、それぞれの lifecycle を表す別 field であり、`doc_status` と置き換えない。

## 3. Source of truth

| Information | Source of truth | 他 document の責務 |
| --- | --- | --- |
| System boundary、process、主要 data flow | [architecture.md](./architecture.md) | Feature document は利用箇所だけを参照し、architecture 全体を複製しない |
| 現在利用できる機能と実装 entry point | [features.md](./features.md) | README は user value の要約に限定する |
| 非自明な root cause／再発防止 | [implementation-notes.md](./implementation-notes.md) | ADR は恒久的な判断だけを保持する |
| Goal、non-goal、AC、test mapping | [Feature Dossier](./feature-dossiers/README.md) | 詳細な現行 contract は専門設計書へ link する |
| 不可逆または trade-off を伴う判断 | [ADR](./adr/README.md) | 実装手順、進捗、test case を複製しない |
| Automated test evidence | `test/`、`test/e2e/`、GitHub Actions | Document は TEST-ID と file／run を参照する |
| Type／API／i18n／coverage／accessibility／dependency gate | [quality-gates.md](./quality-gates.md) | Threshold や baseline の数値だけを他 document に複製しない |
| Change completion／PR readiness／exception | [definition-of-done.md](./definition-of-done.md) | Roadmap／PR template は要約と参照に限定し、別の DoD を作らない |
| Release eligibility と compatibility | [Product Support Matrix](./product-support-matrix.md) | README／Website は matrix より強い availability を表示しない |
| Release 単位の判定 | [release evidence](./release-evidence/README.md) | Secret／certificate／user document は記録しない |
| Engineering 改善の現行進捗 | [engineering-maturity-roadmap.md](./engineering-maturity-roadmap.md) | 完了した個別計画は archive へ移動する |

内容が競合する場合は上表の source of truth を優先し、重複箇所を更新するのではなく参照へ置き換える。

## 4. `docs:check`

```bash
npm run docs:check
```

`scripts/check-docs.mjs` は次を fail-closed で検査する。

- `docs/**/*.md` の metadata 欠落、未対応 status、不正 version／date、template／archive path との不一致
- `docs/`、root public document、VS Code public document、Website document に含まれる local file／directory link
- Markdown heading anchor
- repository 外を指す local link と Windows 固有 separator
- Docs as Code 規約と archive index の存在

Fenced code、inline code、HTML comment 内の sample link は検査対象外とする。HTTP／HTTPS の外部 link は network、rate limit、認証により非決定的になるため CI ではアクセスせず、追加・変更時の review 対象とする。

`docs:check` は `quality:fast` に含め、Pull Request、main、nightly、release gate で同じ検査を実行する。

## 5. Archive policy

- 完了済み implementation plan、closed issue batch、終了した roadmap は `docs/archive/` へ移動する。
- Archive document は履歴 evidence であり、現行仕様の source of truth として参照しない。
- Archive 時に `doc_status: archived`、移動日、後継 source of truth を index に記録する。
- Git history を保持するため内容を削除せず、現行 index から archive index へ link を移す。
- 未完了項目が残る document は archive せず、owner と次の判断条件を明記する。

## 6. Change workflow

1. 変更対象の source of truth を上表から選ぶ。
2. M／L level 変更は実装前に Feature Dossier の AC を確定する。
3. Code と document を同じ branch で更新し、metadata の `last_verified` を実際に確認した日へ更新する。
4. `npm run docs:check` と risk に応じた test を実行する。
5. 完了した plan は archive し、現行 index と roadmap を更新する。
6. PR 本文に変更した source of truth と test evidence を記載する。

## 7. Rollback

Checker 導入自体は runtime data に影響しない。誤検出で開発が停止した場合は、問題の document を除外するのではなく parser test と明示的な syntax contract を修正する。Gate を一時解除する場合も `docs:check` script と metadata は保持し、解除理由、owner、復帰条件を issue／PR に記録する。
