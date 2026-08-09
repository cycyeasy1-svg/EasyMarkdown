# ADR-0001: 診断情報を local-only とし、safe mode で復旧する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-DIAGNOSTICS-RECOVERY`

## Context

EasyMarkdown は利用者の local Markdown 文書を扱う desktop application である。Renderer error や連続起動失敗の解析には実行時 evidence が必要だが、文書本文や local path を外部 service へ送信すると editor の privacy expectation を損なう。また、telemetry service の運用、同意、retention、security response は現時点の project 規模に対して過大である。

## Decision Drivers

- 文書本文、credential、user path を外部へ送信しない。
- Network 不通でも利用者自身が復旧と一次切り分けを行える。
- 診断機能自体の I/O failure が editor 起動を妨げない。
- Session／settings の破損と application code failure を切り分けられる。
- Windows／macOS で同じ contract を維持する。

## Considered Options

1. 外部 crash／telemetry service へ自動送信する。
2. Log を持たず、console と再現手順だけで調査する。
3. Size 制限と redaction を持つ local log、利用者操作による export、safe mode を組み合わせる。

## Decision

Option 3 を採用する。

- Main／Renderer event を local NDJSON として `userData/diagnostics` に保存する。
- Disk write 前と export 前に同じ redaction policy を適用する。
- Export は利用者が保存先を選んだ場合だけ行い、自動 upload しない。
- React Error Boundary から通常再読込、safe mode、限定 reset、診断 export を提供する。
- 5 分以内の unclean launch が 3 回連続した場合は automatic safe mode とする。
- Safe mode は session restore と custom theme だけを一時停止し、保存 data を破壊しない。
- Recoverable filesystem error は対象機能へ隔離し、未知の process exception は fatal とする。

詳細 contract は [診断・復旧設計](../diagnostics-and-recovery.md) を source of truth とする。

## Consequences

### Positive

- Privacy boundary を維持したまま、support に必要な時系列 event を取得できる。
- Network／外部 vendor に依存せず復旧できる。
- Reset 範囲を限定し、disk document と local history を保護できる。

### Negative

- 利用者が report を export／共有しない限り、maintainer は障害を観測できない。
- OS process crash、native crash、disk failure の完全な stack は取得できない。
- Redaction key／path pattern は新しい event contract に合わせて保守が必要である。

## Migration and Rollback

既存 data migration は不要である。Directory と marker は必要時に生成する。Rollback 時は logger／tracker／Error Boundary の登録を除去でき、生成済み file は互換性へ影響しないため自動削除しない。

## Validation

- Redaction、rotation、crash-loop、reset、fatal classification の unit test。
- Built Electron safe mode の smoke E2E。
- Feature Dossier の AC／TEST mapping check。

## References

- [Feature Dossier](../feature-dossiers/diagnostics-recovery/feature.md)
- [Test Specification](../feature-dossiers/diagnostics-recovery/test-spec.md)
- [Security Threat Model](../security-threat-model.md)
