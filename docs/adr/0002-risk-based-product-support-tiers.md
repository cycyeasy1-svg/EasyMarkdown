# ADR-0002: Product 別 tier と release 別 readiness を分離する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-PRODUCT-SUPPORT`

## Context

EasyMarkdown は同一 repository から Desktop、Mobile、VS Code extension、Website を開発する一方、各 product の package、native test、signing、distribution channel は異なる。Version 番号、build 成功、README の download link だけを根拠に一つの「正式版」状態を付けると、未検証 platform まで support しているように見える。また、product が Beta であることと、特定 commit の artifact を今すぐ公開できることも同じではない。

## Decision Drivers

- Product ごとに異なる compatibility と release evidence を正直に表現する。
- Build 可能という事実を support promise や official distribution と混同しない。
- Evidence 不足時は fail-closed にする。
- 小規模 project でも維持できる一つの matrix と一枚の release record に集約する。
- Secret／certificate／user document を repository に保存しない。

## Considered Options

1. Repository 全体に一つの Stable／Beta 状態を付ける。
2. 各 README／release 手順で product ごとに ad hoc な状態を説明する。
3. Product ごとの support tier と release ごとの publication readiness を分離し、共通 release evidence で公開を許可する。

## Decision

Option 3 を採用する。

- Support tier は `Stable`、`Beta`、`Experimental` とし、互換性と support promise を表す。
- Publication readiness は `READY`、`BLOCKED`、`NOT ELIGIBLE` とし、特定 release の公開可否を表す。
- Tier ごとに build、automated test、manual smoke、signing／distribution、rollback／support の最低 contract を定義する。
- Beta／Stable の official publication は `docs/release-evidence/` の record が `APPROVED` になった場合だけ許可する。
- Experimental は official publication 対象外とする。
- Product-specific gate、promotion／demotion、compatibility baseline の source of truth は [Product Support Matrix](../product-support-matrix.md) とする。
- Desktop、Mobile、VS Code の version cadence は統合せず、release evidence から source commit と artifact を追跡する。

## Consequences

### Positive

- 未発行 product や未検証 platform を official と誤表示しにくい。
- 各 product は他 product の成熟を待たず、evidence に基づいて独立に昇格できる。
- Release reviewer が不足 gate、rollback、manual verification を一枚で判断できる。
- Signing secret を保存せず、存在と検証結果だけを監査できる。

### Negative

- Matrix と release evidence を version／platform 変更時に保守する必要がある。
- Native device、notarization、Store／Marketplace の verification は完全自動化できず、manual owner が必要である。
- `Beta` でも readiness が `BLOCKED` になり得るため、二つの状態概念を contributor が理解する必要がある。

## Migration and Rollback

初回導入では repository の検証可能な evidence だけを採用し、未確認の official publication を推測しない。Runtime data／artifact format の migration はない。Policy を置き換える場合は新しい ADR を作成し、過去の release evidence を削除しない。Rollback しても evidence 不足 artifact を official と表示する旧記述には戻さない。

## Validation

- Feature Dossier の AC／TEST mapping check。
- Product Support Matrix の六 product、三 tier、readiness、promotion／demotion review。
- Release 手順と release evidence template の fail-closed review。
- `npm run quality:fast` による repository 全体の regression check。

## References

- [Feature Dossier](../feature-dossiers/product-support-matrix/feature.md)
- [Test Specification](../feature-dossiers/product-support-matrix/test-spec.md)
- [Product Support Matrix](../product-support-matrix.md)
- [Security Threat Model](../security-threat-model.md)
