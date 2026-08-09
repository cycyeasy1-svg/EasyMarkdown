# Feature Dossier 運用規約

Last verified: 2026-08-09

## 1. 目的

Feature Dossier は、すべての変更に大量の設計書を要求するための仕組みではない。変更リスクに応じて必要な情報だけを残し、実装前の期待値と実装後のテスト証跡を追跡可能にするための軽量な成果物である。

本 directory が管理するのは「なぜ作るか」「何を満たせば完了か」「どの test が保証するか」である。詳細な実装説明は既存の architecture／feature document、不可逆な技術判断は ADR、security contract は threat model を source of truth とし、同じ仕様を複製しない。

## 2. リスク分類

複数条件に該当する場合は、最も高い level を採用する。判断に迷う場合は一段階上げる。

| Level | 判断基準 | 必須成果物 |
| --- | --- | --- |
| S | 局所的な不具合、文言、style、既存 contract を変えない小修正 | Issue／再現条件／回帰 test。Dossier は不要 |
| M | 単一 product 内の通常機能、既存 data／IPC／security boundary を変えない変更 | `feature.md`、AC-ID、`test-spec.md` |
| L | 複数 platform、永続 data、session／settings、file format、IPC、Electron privilege、security／privacy、architecture、release／migration に影響 | M の全成果物、ADR、security review、Migration、Rollback |

次のいずれかを変更する場合は、自動的に L とする。

- 保存形式、user data、session、settings、local history
- preload API、IPC channel、file write／delete、external URL、BrowserWindow security option
- Desktop／Mobile／VS Code 間の共通 contract
- 起動、update、install、release、rollback
- privacy、credential、診断情報、権限境界

## 3. Lifecycle

1. **Triage**: owner が S／M／L を決め、対象 platform と non-goal を明記する。
2. **Design**: M／L は `_template/` を複製し、実装前に AC-ID を `approved` にする。
3. **Implementation**: AC-ID は意味を変えず、要件変更時は新しい ID を追加する。
4. **Test review**: 各 AC-ID を一つ以上の TEST-ID に対応させ、repository 内の evidence path を記載する。
5. **Verification**: `npm run feature:check` を成功させ、`last_verified` と status を更新する。
6. **Maintenance**: 現行仕様を変更したときだけ dossier を更新する。廃止時は削除せず `deprecated` とし、後継を記載する。

Status は次を使用する。

| Status | 意味 |
| --- | --- |
| `draft` | AC review 前 |
| `approved` | AC 合意済み、実装可能 |
| `implemented` | 実装済み、検証待ち |
| `verified` | AC と test evidence を確認済み |
| `deprecated` | 廃止済み、履歴参照用 |

## 4. Directory と ID

```text
docs/feature-dossiers/
  _template/
    feature.md
    test-spec.md
  <kebab-case-feature>/
    feature.md
    test-spec.md
docs/adr/
  0000-template.md
  NNNN-<decision>.md
```

- Feature ID: `FD-<DOMAIN>`。例: `FD-DIAGNOSTICS-RECOVERY`
- Acceptance Criteria: `AC-<DOMAIN>-NNN`。例: `AC-DIAG-001`
- Test ID: `TEST-<DOMAIN>-NNN`。例: `TEST-DIAG-001`
- 発行済み ID は再利用しない。表現修正以外で意味が変わる場合は新しい ID を発行する。
- `platforms` は `desktop-windows`、`desktop-macos`、`mobile-ios`、`mobile-android`、`vscode`、`website`、`shared` から選ぶ。

## 5. 自動検査

```bash
npm run feature:check
```

検査対象は `_template` 以外の全 dossier である。次を機械的に失敗させる。

- 必須 metadata／section の欠落、未対応 status／platform
- AC-ID／TEST-ID／Feature ID の重複
- AC-ID に対応する TEST-ID の欠落、未定義 AC-ID への参照
- 自動 test evidence、ADR、security review の参照切れ
- L level での ADR／security review／Migration の欠落

この検査は `quality:fast` に含める。内容の妥当性や UX 品質は機械判定せず、design review の責務とする。

## 6. 導入方針

既存機能を一括して backfill しない。新規 M／L 変更、または既存機能を大きく変更する時点で作成する。最初の実例として `diagnostics-recovery/` を管理し、詳細 contract は既存の `docs/diagnostics-and-recovery.md` を参照する。
