---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# Archive index

本 directory は、完了済みの implementation plan、closed issue batch、終了した roadmap を履歴 evidence として保持する。ここにある document は現行仕様の source of truth ではない。現行 contract は [Docs as Code 運用規約](../documentation-governance.md) の mapping に従う。

| Document | Archived | Reason | Current source of truth |
| --- | --- | --- | --- |
| [keep-mode-implementation-plan.md](./keep-mode-implementation-plan.md) | 2026-08-09 | Keep mode v1 の実装が完了し、計画内の file／手順が現行 code と乖離した | [features.md](../features.md)、[architecture.md](../architecture.md)、test suite |
| [triage-issues.md](./triage-issues.md) | 2026-08-09 | Issue batch A〜D と追加 desktop crash fix が完了した | [features.md](../features.md)、[implementation-notes.md](../implementation-notes.md)、test suite |
| [ux-improvement-roadmap.md](./ux-improvement-roadmap.md) | 2026-08-09 | 全項目が `DONE`／`CORE DONE`／`REMOVED` となった | [engineering-maturity-roadmap.md](../engineering-maturity-roadmap.md)、[features.md](../features.md) |

Archive document を再開する場合は元 file を直接 `active` に戻さず、新しい Feature Dossier または roadmap item を作成して archive を参照する。
