# EasyMarkdown エンジニアリング成熟度改善ロードマップ

| 項目 | 内容 |
| --- | --- |
| Status | Active |
| Owner | Maintainers |
| Created | 2026-08-09 |
| Last verified | 2026-08-09 |
| Target | 軽量な正式開発レベル（継続的に安全な変更・リリースができる状態） |

## 1. 目的

EasyMarkdown は、既にデスクトップ／モバイル／VS Code 拡張、単体テスト、Electron E2E、性能予算、リリース手順を持っており、単純な「vibe coding」段階ではない。一方で、品質ゲートの強制、巨大モジュールの責務分離、Electron のセキュリティ境界、障害解析・復旧の仕組みは、個人の記憶と手作業に依存する部分が残っている。

本ロードマップの目的は、重い業務プロジェクトの資料量をそのまま導入することではなく、次の状態を最小限の運用コストで実現することである。

- 変更前に目的と受入条件を確認できる。
- 変更後に自動検証で回帰を検出できる。
- デスクトップ、モバイル、VS Code 拡張の影響範囲を判断できる。
- 障害発生時に原因を追跡し、安全に復旧できる。
- AI または新しい開発者が、暗黙知だけに頼らず変更できる。

## 2. 基本方針

1. **ゲートを先に、資料を後に増やす。** 実行されない規約より、自動化された検査を優先する。
2. **段階的に分割する。** `App.jsx`、`src/main/index.js`、`app.css` の全面書き直しは行わず、変更対象から責務を抽出する。
3. **リスクに応じて資料量を変える。** 小さな不具合修正に、大機能と同じ設計書一式を要求しない。
4. **共有コアを優先する。** デスクトップ、モバイル、VS Code 拡張で同じ仕様を別実装しない。
5. **ローカル文書の内容を外部へ送信しない。** ログ、診断情報、クラッシュ報告は既定で文書本文を収集しない。

## 3. 優先順位と進捗

### P1 — 正式運用の前提

#### P1-1 品質ゲートを CI／Release に強制する — `DONE`

**実施内容**

- `quality:fast` に version 整合性、lint、単体テスト、desktop build、mobile build、VS Code build を集約する。
- Pull Request では `quality:fast` と Electron smoke E2E を実行する。
- main／定期実行／リリース前では full E2E を実行する。
- Release job は品質ゲート成功後のみ package／publish できるようにする。
- CI の一時 Vite 設定ファイル競合を避けるため、同一 workspace 内の build と lint を直列化する。

**受入条件**

- [x] `npm run quality:fast` がローカルで成功する。
- [x] `npm run quality:fast` が初回 GitHub Actions で成功する。
- [x] `npm run test:e2e:smoke:built` が build 済み成果物を検証する。
- [x] PR workflow に fast gate と smoke E2E が独立 job として定義されている。
- [x] tag release が full gate を通過しない限り publish されない dependency になっている。
- [x] Windows／macOS の packaging 前チェック項目が文書化されている。

**2026-08-09 検証 evidence**

- `npm run quality:fast`: 72 test files／527 unit tests、desktop build、mobile build、VS Code build 成功。
- `npm run test:e2e:smoke:built`: 5／5 成功（safe mode 実起動を含む）。
- `npm run test:e2e:built`: 101／101 成功（161.1 秒）。
- `.github/workflows/ci.yml` と `.github/workflows/release.yml`: YAML parse 成功。
- GitHub Actions CI Run #47（PR #1）: Fast quality gate／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P1-2 巨大モジュールを責務別に段階分割する — `DONE`（第一 feature slice）

**対象境界**

- Renderer feature: workspace、tabs、document、search、history、export、settings。
- Main service／IPC: filesystem、workspace、history、export、shell、window。
- Shared core: Keep parser、Markdown link、format、i18n contract。
- Style: token、shell、editor、feature、platform、theme compatibility。

**進め方**

- 新機能または修正対象の責務から、純粋関数、state transition、service、hook の順で抽出する。
- `App.jsx` は画面構成と feature 間 orchestration、`src/main/index.js` は起動と登録に限定していく。
- Typora 互換 custom theme の selector／CSS 順序を契約テストで保護してから CSS を分割する。
- Nx／Turborepo 等の導入は、workspace 管理上の実害が確認されるまで保留する。

**受入条件**

- [x] window lifecycle IPC と update check が独立モジュールと単体テストへ移動している。
- [x] 既存 unit／smoke E2E が無変更で成功する。
- [x] 今回移動した channel は `registerWindowIpc`／`registerUpdateIpc` から登録される（privileged IPC の共通検証は P1-3）。
- [x] composition root への channel 再混入と Electron 直接依存を architecture boundary test で検証する。

**2026-08-09 検証 evidence**

- 新規 module tests: 12／12 成功。
- ESLint: 成功。
- Electron build＋smoke E2E: 4／4 成功。
- 残る `App.jsx`／filesystem／workspace／CSS 分割は、変更対象から段階継続する。

#### P1-3 Electron／リリースのセキュリティ境界を強化する — `IN PROGRESS`（fail-closed gate 実装済み、初回署名 release／provenance 待ち）

**実施内容**

- main renderer の sandbox 対応、preload API の最小化、全 IPC の sender／payload／path 検証を共通化する。
- `webSecurity: false` を廃止し、印刷／HTML export を隔離された安全な経路へ移行する。
- untrusted Markdown、raw HTML、custom theme、外部 URL、file write/delete、update を対象とする短い threat model を作る。
- 公式配布前に Windows code signing、macOS signing＋notarization、checksum／provenance を導入する。

**受入条件**

- [x] main window が sandbox 有効で起動し、smoke E2E が成功する。
- [x] すべての privileged IPC に sender と入力検証がある。
- [x] `webSecurity: false` を使用する BrowserWindow が存在しない。
- [x] security regression test と threat model が追加されている。
- [x] 署名情報がない release は正式版として publish されない運用になっている。

**2026-08-09 検証 evidence**

- sandbox 対応の CJS preload、`contextIsolation: true`、`nodeIntegration: false` を build と static regression test で確認した。
- `trusted-ipc.js` と `ipc-policy.js` により、全 privileged IPC の main-frame sender 検証と path／payload 検証を共通化した。
- 印刷用 BrowserWindow を隔離し、`webSecurity: false` を廃止した。security／IPC を含む unit test は 72 files／527 tests、desktop full E2E は 101／101 成功した。
- threat model は `docs/security-threat-model.md` を source of truth とする。
- tag workflow は signing／notarization secret の存在を最初に検証し、`forceCodeSigning=true` と macOS `notarize=true` を強制する。secret がない release は publish されない。
- Windows signing certificate、Apple Developer ID／notarization credential は repository 外の release secret が必要なため、初回の署名済み release 実績は未完了。checksum／provenance と合わせ、完了するまでは P1-3 を `IN PROGRESS` とする。

#### P1-4 可観測性と復旧手段を追加する — `DONE`

**実施内容**

- Renderer Error Boundary と回復 UI を追加する。
- main／renderer の構造化ローカルログ、rotation、機密情報 redaction を実装する。
- 診断情報の手動 export、crash-loop safe mode、設定／session の限定リセットを提供する。
- watcher の既知エラーと未知の fatal exception を区別し、未知例外を無条件に握りつぶさない。

**受入条件**

- [x] 意図的な renderer 例外で、白画面ではなく回復 UI が表示される。
- [x] 診断 export に文書本文、アクセストークン、不要な絶対パスが含まれない。
- [x] 連続起動失敗時に safe mode へ退避できる。
- [x] fatal error と recoverable watcher error の処理方針がテストされている。

**2026-08-09 検証 evidence**

- `AppErrorBoundary` の意図的な render error test で、boot splash 除去、recovery UI、renderer diagnostic event を確認した。
- main／renderer event は rotation 付き local NDJSON に保存し、disk write 前と user-triggered export 前に二重 redaction する。文書本文、credential、absolute user path の privacy regression test を追加した。
- 5 分以内の unclean launch 3 回で automatic safe mode へ入り、session 復元と custom theme を無効化する。保存済み session を safe mode から上書きしない。
- session と settings は別々の確認付き reset とし、disk document／local history は削除しない。
- `quality:fast`、smoke E2E 5／5、full E2E 101／101 が成功した。運用 contract は `docs/diagnostics-and-recovery.md` を source of truth とする。

### P2 — 継続開発をチーム化できる状態

#### P2-1 リスク別 Feature Dossier — `DONE`

| 変更区分 | 必須資料 |
| --- | --- |
| S: 局所的な不具合／文言 | Issue、再現条件、回帰テスト |
| M: 通常機能 | `feature.md`、AC-ID、テスト対応表 |
| L: 複数 platform／storage／IPC／architecture | `feature.md`、ADR、security／migration／rollback |

`feature.md` の最小項目は Context、Goal、Non-goal、対象 platform、`AC-xx`、UX／data／contract、risk、test mapping、rollout／rollback とする。設計レビューでは実装前に AC を確定し、テストレビューでは AC と test ID の欠落だけを機械的に検出する。

**受入条件**

- [x] S／M／L の判定基準、必須成果物、lifecycle、ID 規則が一つの運用規約に定義されている。
- [x] `feature.md`、`test-spec.md`、ADR の template があり、L level の実例が一組存在する。
- [x] AC-ID／TEST-ID の欠落、重複、未定義参照と evidence／ADR／security review の参照切れを機械的に検出する。
- [x] `npm run feature:check` が `quality:fast` に含まれ、local で成功する。
- [x] `npm run feature:check` が初回 GitHub Actions で成功する。

**2026-08-09 検証 evidence**

- `diagnostics-recovery`: L level 実例、5 AC、7 TEST mapping、ADR-0001 を追加した。
- `npm run feature:check`: 1 dossier／5 AC／7 tests 成功。
- Checker unit test: 6／6 成功。欠落 mapping、未定義 AC、L level 必須 evidence を検証した。
- `npm run quality:fast`: lint、73 files／533 unit tests、desktop／mobile／VS Code build 成功。
- GitHub Actions CI Run #50（PR #2）: Fast quality gate／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P2-2 Product Support Matrix — `DONE`

- Desktop Windows／macOS、Mobile iOS／Android、VS Code extension、Website の release tier を Stable／Beta／Experimental で宣言する。
- tier ごとに必要な build、test、manual smoke、署名、rollback 条件を定義する。

**受入条件**

- [x] 六つの product に compatibility baseline、tier、readiness、evidence、owner が定義されている。
- [x] Stable／Beta／Experimental の build、test、manual smoke、signing／distribution、rollback／support contract が定義されている。
- [x] Product 固有 gate、promotion／demotion 条件、未検証範囲が明示されている。
- [x] Beta／Stable の公開を release evidence で authorization し、不足時は fail-closed にする。
- [x] `npm run quality:fast` が local で成功する。
- [x] P2-2 の初回 GitHub Actions が成功する。

**2026-08-09 検証 evidence**

- `docs/product-support-matrix.md`: 六つの product、三 tier、readiness、product 固有 gate、promotion／demotion policy を定義した。
- `docs/release-evidence/`: Beta／Stable の公開判断 template と secret 非保存規則を追加した。
- `product-support-matrix`: L level Feature Dossier、5 AC、5 TEST mapping、ADR-0002 を追加した。
- `npm run feature:check`: 2 dossier／10 AC／12 tests 成功。
- `npm run quality:fast`: version／dossier／lint、73 files／533 unit tests、desktop／mobile／VS Code build 成功。
- GitHub Actions CI Run #53（PR #3）: Fast quality gate／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P2-3 Docs as Code

- version、status、owner、last verified、broken link を `docs:check` で検査する。
- 重複した仕様を削り、architecture／feature／ADR／test evidence の source of truth を決める。
- 完了済み計画は archive し、現行仕様と履歴を混在させない。

#### P2-4 型・契約・回帰検査の段階導入

- 新規 IPC contract、session、settings、抽出 module から TypeScript または JSDoc `checkJs` を導入する。
- desktop／mobile API conformance、i18n key parity、coverage baseline no-regression、axe smoke、dependency scanning を追加する。
- 全面 TypeScript 化は行わず、境界から型を付ける。

### P3 — 開発体験と最終整備

- `.editorconfig`、formatter、PR template、Definition of Done を統一する。
- architecture import boundary を自動検査する。
- UI の残課題は `/harden` → `/optimize` → `/adapt` → `/polish` の順で再監査する。

## 4. 推奨スケジュール

| 期間 | 到達点 |
| --- | --- |
| 1〜2週間 | P1-1、security quick wins、Error Boundary／logger 骨格、docs check の最小版 |
| 1〜2か月 | `App.jsx`／main／CSS の段階分割、typed IPC、テスト階層化、shared core 境界 |
| 正式公開前 | code signing／notarization、全 release matrix、install／upgrade／rollback、診断／support、checksum／provenance |

## 5. Definition of Done（共通）

変更は、次を満たしたときに完了とする。

- 目的、non-goal、対象 platform、受入条件が確認できる。
- 変更リスクに応じた unit／integration／E2E が追加または更新されている。
- `quality:fast` が成功し、UI／Electron lifecycle の変更は smoke E2E も成功している。
- Windows／macOS、desktop／mobile／VS Code の非対象範囲と影響が明記されている。
- data／settings／file format の変更には migration と rollback がある。
- security、privacy、accessibility、performance の影響が確認されている。
- 関連文書と `Last verified` が更新されている。

## 6. 進捗更新ルール

- 状態は `PLANNED` → `IN PROGRESS` → `DONE` の順で更新する。
- 各項目を `DONE` にする際は、受入条件の checkbox と検証コマンド／結果を同時に更新する。
- 実装中に新しい課題を発見しても、既存 P1 の完了条件を無制限に拡張しない。別項目として severity と根拠を記録する。
- 本文書はロードマップの source of truth とし、別の TODO 一覧を重複作成しない。
