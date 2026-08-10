---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# Definition of Done

## 1. 目的

本書は EasyMarkdown の変更を「実装が終わった」から「安全に review／merge できる」へ進める共通完了条件の source of truth である。資料量を一律に増やさず、[Feature Dossier 運用規約](./feature-dossiers/README.md) の S／M／L risk に応じて必要な evidence を追加する。

## 2. 全変更の共通条件

- 目的、対象範囲、non-goal、利用者／開発者への影響が説明されている。
- Diff は一つの論理変更に集中し、無関係な refactor、generated artifact、mass-format を含まない。
- 新規／変更 supported file は `npm run format:check`、JavaScript は `npm run lint` を通る。
- 変更 risk に応じた最小 test が追加または更新され、実行 command と結果が PR に記載されている。
- 既存 source of truth、public document、Feature Dossier、ADR、test mapping のうち影響対象が同じ PR で更新されている。
- Secret、credential、user document 本文、不要な絶対 path を code、log、fixture、PR evidence に含めない。
- Rollback 方法と、自動化していない residual risk が説明されている。

## 3. Risk 別追加条件

| Risk | 必須条件 |
| --- | --- |
| S | Issue／再現条件、対象を固定する regression test、影響範囲が局所である根拠 |
| M | Approved `feature.md`、AC-ID、全 AC に対応する TEST-ID、対象 platform、rollout／rollback |
| L | M の全条件、Accepted ADR、security review、migration／compatibility、product-specific release／rollback evidence |

S から M／L の条件に一つでも該当した場合は上位 risk を採用する。判断基準は [Feature Dossier 運用規約](./feature-dossiers/README.md) を優先する。

## 4. 変更種別ごとの追加 gate

| Trigger | Done に必要な追加 evidence |
| --- | --- |
| Renderer UI／keyboard／Electron lifecycle | `npm run test:e2e:smoke:built`。重要 interaction は focused または full E2E |
| API／session／settings／i18n boundary | API／type／i18n check と対応 unit test。互換性／migration を明記 |
| Dependency／workflow／release | `npm run dependencies:check`、workflow parse、fail-closed dependency、rollback |
| Security／privacy／IPC／file operation | Threat model／security review、negative test、credential 非保存、最小権限 |
| Performance-sensitive path | 既存 budget command または before／after measurement。未測定理由を明記 |
| Product availability／distribution | Product Support Matrix と release evidence。`BLOCKED`／`NOT ELIGIBLE` を公開しない |
| Document-only | `npm run docs:check`。M／L dossier の contract を変える場合は `npm run feature:check` |

## 5. Ready for review と Merge

Draft PR は設計／実装／evidence が未完でもよい。次を満たした時点で Ready for review にする。

- AC と対象 risk が確定し、reviewer が判断できる説明と diff がある。
- 必要な local gate が成功し、未実施 test と理由が明記されている。
- Known blocker、migration、rollback、residual risk が隠されていない。

Merge は required GitHub Actions が成功し、requested change／未解決 review thread／既知 P0・P1 blocker がなく、document と code が同じ contract を表す場合に限る。Build 成功だけを product release authorization とみなさない。

## 6. Exception policy

External outage や既知 flaky test により gate を一時解除する場合は、PR／issue に owner、理由、影響範囲、代替 evidence、復帰条件、期限を記載する。Threshold、baseline、ignore path を単に gate を通す目的で緩和しない。緊急 rollback 後も regression test と document correction を follow-up として追跡する。

## 7. 基本 command

```bash
npm run format:check
npm run quality:fast
npm run dependencies:check
npm run test:e2e:smoke:built
```

詳細な gate scope は [Quality Gate 運用規約](./quality-gates.md)、build／E2E 手順は [開発・構建・測試](./development.md) を参照する。
