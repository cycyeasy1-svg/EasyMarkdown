---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# EasyMarkdown エンジニアリング成熟度改善ロードマップ

| 項目 | 内容 |
| --- | --- |
| Created | 2026-08-09 |
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

#### P2-3 Docs as Code — `DONE`

- version、status、owner、last verified、broken link を `docs:check` で検査する。
- 重複した仕様を削り、architecture／feature／ADR／test evidence の source of truth を決める。
- 完了済み計画は archive し、現行仕様と履歴を混在させない。

**受入条件**

- [x] `docs/**/*.md` に version、status、owner、last verified metadata が存在する。
- [x] Local file／directory／heading link と repository boundary を `docs:check` が検査する。
- [x] Architecture／feature／implementation note／Feature Dossier／ADR／test／release／roadmap の source of truth が定義されている。
- [x] 完了済み Keep mode plan、issue batch、UX roadmap が archive index へ移動している。
- [x] `docs:check` が `quality:fast` に含まれている。
- [x] `npm run quality:fast` が local で成功する。
- [x] P2-3 の初回 GitHub Actions が成功する。

**2026-08-09 検証 evidence**

- `npm run docs:check`: 35 documents／52 link sources／211 local links 成功。
- Docs checker unit test: 8／8 成功。Metadata、code exclusion、heading anchor、missing target、repository escape、separator、path case を検証した。
- 完了済み plan 3 件を `docs/archive/` へ移動し、public roadmap と mobile install 表示を Product Support Matrix に整合させた。
- `docs-as-code`: L level Feature Dossier、5 AC、5 TEST mapping、ADR-0003 を追加した。
- `npm run feature:check`: 3 dossier／15 AC／17 tests 成功。
- `npm run quality:fast`: version／dossier／docs／lint、74 files／541 unit tests、desktop／mobile／VS Code build 成功。
- GitHub Actions CI Run #56（PR #4）: Fast quality gate／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P2-4 型・契約・回帰検査の段階導入 — `DONE`

- 新規 IPC contract、session、settings、抽出 module から TypeScript または JSDoc `checkJs` を導入する。
- desktop／mobile API conformance、i18n key parity、coverage baseline no-regression、axe smoke、dependency scanning を追加する。
- 全面 TypeScript 化は行わず、境界から型を付ける。

**受入条件**

- [x] API、session、settings、i18n contract 等の boundary が JSDoc `checkJs` の対象である。
- [x] Desktop preload／Capacitor shim の API と全 capability を static／runtime／unit test で検査する。
- [x] Locale key／placeholder parity と固定 coverage floor を `quality:fast` で fail-closed にする。
- [x] Built Electron startup app chrome の axe serious／critical violation を smoke E2E で検査する。
- [x] Root／VS Code dependency audit の severity no-regression を CI／release の独立 gate にする。
- [x] Gate scope、threshold、baseline、残存 risk、rollback が source-of-truth document と L level dossier に記載される。
- [x] `npm run quality:fast`、dependency check、smoke E2E が local で成功する。
- [x] P2-4 の初回 GitHub Actions が成功する。

**2026-08-09 検証 evidence**

- `docs/quality-gates.md`: boundary-first type、17 capability、i18n、coverage、axe、dependency baseline の運用 contract を定義した。
- `type-contract-regression`: L level Feature Dossier、7 AC、9 TEST mapping、ADR-0004 を追加した。
- `npm run api:check`: Desktop 82 keys／Mobile 46 keys／17 capability 成功。`npm run type:check` と 3 locale／825 key の i18n parity も成功した。
- `npm run quality:fast`: 78 files／561 unit tests、coverage statements 73.46%／branches 76.52%／functions 74.57%／lines 73.44%、Desktop／Mobile／VS Code build 成功。
- Dependency baseline は root 20 件（moderate 2／high 17／critical 1）、VS Code 3 件（moderate 3）。既知 risk の waiver ではなく新規増加の block に限定する。
- `npm run dependencies:check`: 両 project の no-regression 成功。CI／release workflow の YAML parse も成功した。
- `npm run test:e2e:smoke:built`: axe app-chrome check を含む 6／6 成功。`npm run test:e2e:built`: 102／102 成功（213.9 秒）。
- GitHub Actions CI Run #59（PR #5）: Fast quality gate／Dependency baseline scan／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

### P3 — 開発体験と最終整備

#### P3-1 Contributor workflow と Definition of Done — `DONE`

- `.editorconfig`、incremental formatter、PR template、risk-based Definition of Done を統一する。
- Existing source の mass-format は行わず、新規／変更 file から formatter contract を適用する。

**受入条件**

- [x] EditorConfig、exact pinned formatter、repository config、ignore policy が存在する。
- [x] 新規／変更 supported file のみを選択する format check／write command と unit test がある。
- [x] `format:check` が `quality:fast` と Pull Request base diff に統合される。
- [x] PR template が risk、platform、evidence、impact、rollback、DoD を案内する。
- [x] Risk-based Definition of Done が source of truth として定義され、Contributor guide／AGENTS から参照される。
- [x] Local `quality:fast` と Electron smoke が成功する。
- [x] P3-1 の初回 GitHub Actions が成功する。

**2026-08-09 検証 evidence**

- Prettier 3.9.6 と eslint-config-prettier 10.1.8 を exact pin し、EditorConfig／Git EOL／ignore contract を追加した。
- `npm run format:check`: Pull Request base SHA を指定した 8 changed supported files の検査に成功。意図的な未整形状態では 7 files を検出し、`npm run format` 後に成功することも確認した。
- Formatter／workflow contract unit test: 2 files／9 tests 成功。NUL path、Unicode／space、重複、ignore、deleted／unsupported／external path、base ref、PR／DoD contract を検証した。
- `npm run quality:fast`: 80 files／570 unit tests、coverage statements 73.57%／branches 76.52%／functions 74.57%／lines 73.55%、Desktop／Mobile／VS Code build 成功。
- `npm run dependencies:check`: root／VS Code とも baseline 比 no-regression。CI／release workflow の YAML parse 成功。
- `npm run docs:check`: 42 documents／59 link sources／236 local links 成功。`npm run feature:check`: 5 dossier／27 AC／32 tests 成功。
- `npm run test:e2e:smoke:built`: axe app-chrome check を含む 6／6 成功。
- GitHub Actions CI Run #60（PR #6）: Fast quality gate／Dependency baseline scan／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P3-2 Architecture import boundary — `DONE`

- Main／preload／renderer／shared／platform adapter の import boundary を自動検査する。
- Existing cross-layer pure logic を shared source of truth へ移し、violation baseline／ignore は導入しない。

**受入条件**

- [x] Static import、re-export、literal dynamic import、require を JS／JSX AST から抽出する。
- [x] Main／preload／renderer／shared／platform の許可 dependency direction を定義・検査する。
- [x] Electron／Node.js／Capacitor dependency を runtime owner に限定する。
- [x] Renderer が platform public entry 以外を deep import できない。
- [x] Existing renderer → main helper edge を shared module へ移し、compatibility test を維持する。
- [x] `architecture:check` が `quality:fast` と contributor／architecture document に統合される。
- [x] Local `quality:fast`、dependency no-regression、Electron smoke が成功する。
- [x] P3-2 の初回 GitHub Actions が成功する。

**2026-08-09 検証 evidence**

- `npm run architecture:check`: 137 managed files／376 imports、main 22／preload 1／renderer 104／shared 8／platform 2、zero-waiver で成功。
- Architecture policy unit test 9／9、既存 main helper characterization test 36／36 成功。
- `src/shared/markdown.js` を source of truth とし、Renderer の main direct import を解消した。Main は compatibility re-export を維持する。
- ADR-0005、L level Feature Dossier、7 AC／7 TEST mapping を追加した。
- `npm run quality:fast`: 81 files／579 unit tests、coverage statements 73.59%／branches 76.52%／functions 74.57%／lines 73.57%、Desktop／Mobile／VS Code build 成功。
- `npm run dependencies:check`: root／VS Code とも baseline 比 no-regression。`npm run test:e2e:smoke:built`: axe app-chrome check を含む 6／6 成功。
- `npm run docs:check`: 45 documents／62 link sources／248 local links 成功。`npm run feature:check`: 6 dossier／34 AC／39 tests 成功。
- GitHub Actions CI Run #63（PR #7）: Fast quality gate／Dependency baseline scan／Electron smoke E2E 成功。PR 方針どおり full E2E は skip。

#### P3-3 UI residual risk audit — `IN PROGRESS`

- UI の残課題は `/harden` → `/optimize` → `/adapt` → `/polish` の順で再監査する。
- Visual redesign ではなく、reproducible な accessibility、minimum-window、keyboard、performance evidence の residual risk を対象とする。

**受入条件**

  - [x] 720×480 の built Electron app で document、Settings、Help の horizontal containment と操作到達性を検証する。
  - [x] Controlled Keep fixture の app 全体で axe `serious`／`critical` violation が 0 件になる。
  - [x] Overflow tab strip が `tablist`／`tab` semantics と Arrow／Home／End keyboard activation を持つ。
  - [x] `perf-app`／`perf-resume` が selector timeout なく report を生成し、既存 budget を維持する。
  - [x] Desktop／Mobile／VS Code の fast quality gate と Electron smoke／focused E2E が成功する。
  - [x] Windows automation で代替できない macOS／mobile／assistive technology／custom content の residual risk を記録する。
  - [ ] P3-3 の初回 GitHub Actions が成功する。

  **2026-08-09 local 検証 evidence**

  - `npm run test:e2e:smoke:built`: 720×480、Keep／Settings／Help、light／dark axe check、tab keyboard operation を含む 7／7 成功。
  - `npm run test:e2e:built`: 全 103／103 成功。
  - `node scripts/perf-app.mjs --runs=1`: 31／31 budget 成功。`node scripts/perf-resume.mjs --runs=1`: 5／5 budget 成功。いずれも既存 threshold は変更していない。
  - `npm run quality:fast`: 81 files／579 unit tests、coverage statements 73.59%／branches 76.52%／functions 74.57%／lines 73.57%、Desktop／Mobile／VS Code build 成功。
  - `npm run dependencies:check`: root／VS Code とも 2026-08-09 baseline 比 no-regression。
  - 自動化外の macOS／mobile 実機、assistive technology、OS text scaling、任意 Markdown／custom theme は [Feature Dossier](./feature-dossiers/ui-residual-risk/feature.md) の residual risk として維持する。Product Support Matrix と release eligibility は変更しない。

## 4. 推奨スケジュール

| 期間 | 到達点 |
| --- | --- |
| 1〜2週間 | P1-1、security quick wins、Error Boundary／logger 骨格、docs check の最小版 |
| 1〜2か月 | `App.jsx`／main／CSS の段階分割、typed IPC、テスト階層化、shared core 境界 |
| 正式公開前 | code signing／notarization、全 release matrix、install／upgrade／rollback、診断／support、checksum／provenance |

## 5. Definition of Done（共通）

全変更の共通条件、S／M／L risk 別追加条件、Ready／merge、exception policy は [Definition of Done](./definition-of-done.md) を source of truth とする。Roadmap item を `DONE` にする場合は、その item の受入条件、検証 evidence、Definition of Done の三つを満たす。

## 6. 進捗更新ルール

- 状態は `PLANNED` → `IN PROGRESS` → `DONE` の順で更新する。
- 各項目を `DONE` にする際は、受入条件の checkbox と検証コマンド／結果を同時に更新する。
- 実装中に新しい課題を発見しても、既存 P1 の完了条件を無制限に拡張しない。別項目として severity と根拠を記録する。
- 本文書はロードマップの source of truth とし、別の TODO 一覧を重複作成しない。
