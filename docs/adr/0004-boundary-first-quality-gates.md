---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# ADR-0004: Boundary-first 型導入と no-regression quality gate を採用する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-TYPE-CONTRACT-REGRESSION`

## Context

EasyMarkdown は大部分が JavaScript であり、Desktop preload、Capacitor shim、session、settings、locale の contract が comment と利用側の暗黙知に分散していた。全面 TypeScript 化は変更量と regression risk が大きく、既存巨大 module の段階分割方針に反する。一方、coverage／accessibility／dependency scanning を単なる report として追加しても、悪化を block できず運用が形骸化する。

Dependency audit は network availability に依存し、既存 lockfile には解消未完了の vulnerability がある。Fast gate に無条件で混ぜると local development が外部 registry に依存し、baseline を「安全」と誤認する risk もある。

## Decision Drivers

- Runtime 影響が大きい boundary を少ない変更で保護する。
- Desktop／Mobile の contract drift を merge 前に検出する。
- Gate を deterministic に保ち、network failure と product regression を区別する。
- 既存技術 debt を隠さず、新規悪化を直ちに停止する。
- 数値指標が Electron E2E、manual compatibility、security review を置き換えない。
- Gate の緩和に明示的な review evidence を要求する。

## Considered Options

1. 現状どおり review と build 成功だけで contract／regression を確認する。
2. Repository 全体を一括 TypeScript 化し、すべての module を strict check する。
3. Boundary-first `checkJs`、shared runtime contract、固定 no-regression threshold を段階導入する。
4. Coverage／axe／audit を report-only とし、merge／release を block しない。
5. Dependency audit を network 非依存 gate と同じ local fast chain に含める。

## Decision

Option 3 を採用し、dependency audit の実行位置だけは Option 5 を採用しない。

- TypeScript compiler は JavaScript source に対する JSDoc `checkJs`／`noEmit` として使用し、API、session、settings、抽出 pure module から対象を増やす。
- `src/shared/api-contract.js` に core method、capability key、Desktop／Mobile profile、runtime validator を置く。
- Adapter の explicit object literal を static checker で解析し、runtime assertion と unit validator の三層で conformance を確認する。
- Locale parity と coverage threshold は network 非依存の `quality:fast` に含める。
- Axe は built Electron の startup app chrome で `serious`／`critical` を fail させる。Editor scope は別 item として残す。
- Dependency audit は severity 別 committed baseline と比較する独立 CI／release job とし、後続 smoke／full E2E／publish の dependency にする。
- Dependency baseline は risk acceptance ではない。増加を block し、既存 debt は別の compatibility-reviewed batch で削減する。

## Consequences

### Positive

- 全面 rewrite なしで platform／persistent boundary の drift を検出できる。
- Unsupported capability が missing property ではなく明示 `false` となり、renderer の推測が減る。
- Locale、coverage、accessibility、dependency の悪化が同じ PR で見える。
- Network outage が local fast feedback を不必要に停止しない。
- Existing vulnerability と新規 regression を区別して管理できる。

### Negative

- JSDoc type と runtime validator の双方を保守する必要がある。
- Static API checker は explicit object literal という coding contract を追加する。
- Coverage threshold は test quality を保証せず、metric gaming の review が必要である。
- App chrome axe smoke は editor／assistive technology 全体を保証しない。
- Existing critical／high dependency debt は残り、別改善 batch と owner 判断が必要である。

## Migration and Rollback

Session helper は compatibility re-export を残して dependency-free module へ移す。Desktop／Mobile capability は shared profile に置換し、adapter 公開時に assertion を実行する。既存 user data と file format の migration はない。

Rollback は profile、adapter、renderer 利用箇所を同じ change set で戻す。Checker 誤検出は最小再現 test とともに修正し、threshold／baseline の無根拠な緩和や gate 全体の削除は行わない。一時解除には owner、期限、復帰条件を必要とする。

## Validation

- API contract の unit／static check と runtime assertion。
- Boundary `checkJs`、current locale parity、coverage threshold。
- Built Electron startup app chrome の axe smoke。
- Root／VS Code dependency audit comparison と workflow dependency。
- `npm run quality:fast`、`npm run dependencies:check`、Electron smoke E2E、Pull Request CI。

## References

- [Feature Dossier](../feature-dossiers/type-contract-regression/feature.md)
- [Test Specification](../feature-dossiers/type-contract-regression/test-spec.md)
- [型・契約・回帰 Quality Gate 運用規約](../quality-gates.md)
- [Security Threat Model](../security-threat-model.md)
