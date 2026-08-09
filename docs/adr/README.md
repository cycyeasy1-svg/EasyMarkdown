# Architecture Decision Record 運用規約

Last verified: 2026-08-09

ADR は、L level 変更のうち、後から理由を復元しにくい architecture／data／security／platform 判断を記録する。実装手順や進捗管理には使用しない。

## 作成条件

- 複数の妥当な選択肢があり、trade-off を伴う。
- IPC、privilege、data format、storage、platform boundary を変更する。
- Rollback や migration に設計判断が必要である。
- 将来「なぜこの方式か」を code だけから判断できない。

## 規則

- File 名は `NNNN-kebab-case.md` とし、番号を再利用しない。
- Status は `Proposed`、`Accepted`、`Superseded`、`Deprecated` を使用する。
- Accepted ADR の過去判断は書き換えない。新しい判断で置き換える場合は新 ADR を作り、双方に参照を追加する。
- Feature の目的／AC／test mapping は Feature Dossier、現行の詳細 contract は専門設計書を source of truth とする。
- Template は [0000-template.md](./0000-template.md) を使用する。

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](./0001-local-diagnostics-and-safe-mode.md) | Accepted | 診断情報を local-only とし、safe mode で復旧する |
| [0002](./0002-risk-based-product-support-tiers.md) | Accepted | Product 別 support tier と release 別 publication readiness を分離する |
