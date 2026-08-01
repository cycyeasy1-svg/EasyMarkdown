# 起動・復帰パフォーマンス調査記録

- 更新日: 2026-08-01
- 対象: EasyMarkdown デスクトップ版（Windows を中心に確認）
- 目的: 初回起動時、および一定時間バックグラウンドに置いた後の復帰時に操作可能になるまで待たされる事象について、調査結果・仮説・段階的な対応計画を継続的に記録する。

## 1. 結論

現時点では、「起動時の待ち」と「長時間未使用後の復帰時の待ち」は、同じ症状に見えても主要因が異なる可能性が高い。

- 起動時は、レンダラーバンドルの解析・実行・React の初期マウントに加え、セッション復元時にサイドバーが休眠中の全タブの親ディレクトリを読み込んで展開する処理が重なっている。
- 復帰時は、アプリ側の `focus` イベント処理で長い JavaScript タスクが発生している証拠は得られていない。Windows が非表示・最小化されたプロセスのワーキングセットや GPU リソースを縮小し、復帰時に再常駐化・再描画する影響が有力である。ただし、現行の検証機では数秒規模の停止を再現できておらず、確定原因ではない。
- テーマ一覧の再帰走査、未圧縮のレンダラーバンドル、CSP により実際には利用できない Google Fonts の読み込み指定も、起動経路から外せる低リスクの負荷である。

したがって、第1次対応では、機能設計を変えずに起動クリティカルパス上の不要な仕事を削減する。第2次対応でコード分割と軽量シェル先行表示、第3次対応でエディター常駐量、Electron 世代、署名を含む構造的な改善を行う。

## 2. 調査範囲と方法

以下を対象に、コードリーディング、ビルド成果物の解析、Electron E2E/CDP 計測、Windows プロセスのワーキングセット観測を実施した。

- プロセス開始から対象文書が表示されるまでの時間
- DOM interactive、スプラッシュ終了、レンダラー内の長時間タスク
- レンダラーバンドルのサイズとモジュール別内訳
- 複数タブを含むセッション復元時のサイドバー処理
- 最小化・被覆状態からのフォーカス、2 回の `requestAnimationFrame`、ポインター応答
- 大規模表を表示した状態でのレンダラー/GPU ワーキングセット縮小後の復帰

計測値は開発機・一時ディスク・OS キャッシュ状態に依存する。絶対値より、処理経路と相対差を重視する。

## 3. 計測結果

### 3.1 通常のコールド起動

現行の未圧縮ビルドで 4 回計測した。

| 項目 | 初回 | 2 回目 | 3 回目 | 4 回目 |
| --- | ---: | ---: | ---: | ---: |
| プロセス開始 → 文書表示 | 2,343.7 ms | 1,360.5 ms | 1,424.8 ms | 1,399.0 ms |
| DOM interactive | 1,649.8 ms | 約 617 ms | 約 637 ms | 約 630 ms |
| スプラッシュ終了 | 約 2.70 s | 約 1.58 s | 約 1.65 s | 約 1.62 s |
| navigation `responseEnd` | 約 40–70 ms | 約 40–70 ms | 約 40–70 ms | 約 40–70 ms |

HTML 自体の読み込みは短く、待ち時間の大部分はレンダラーの解析・実行・初期マウント側にある。初回だけ大きく遅くなる部分には、OS/Defender のディスクキャッシュおよび未署名バイナリのリアルタイムスキャンも影響し得る。

### 3.2 レンダラーバンドル

現行成果物の主なサイズは次のとおりである。

| 成果物 | サイズ |
| --- | ---: |
| エントリー JavaScript | 1,330,856 bytes（未圧縮） |
| CSS | 320,308 bytes |
| `minify: esbuild` の A/B ビルド | 約 771,772 bytes |

未圧縮のプログラム解析結果（合計約 1.28 MB）の主な内訳は次のとおりである。

| 分類 | 概算サイズ |
| --- | ---: |
| KeepEditor 関連スタック | 512 KB |
| `App.jsx` | 234 KB |
| React | 149 KB |
| i18n | 104 KB |
| オプション UI | 88 KB |
| デスクトップでは不要な Capacitor/モバイルアダプター | 49 KB |
| シェル中核 | 106 KB |

minify によりディスク読み込み・解析対象は縮小するが、単独の A/B 計測では初回起動の決定的な改善にはならなかった。低リスクの基礎改善として採用し、根本対策は第2次対応のコード分割で行う。

### 3.3 セッション復元とサイドバー

30 タブを別々の枝（深さ 4）に復元する合成セッションで、サイドバーの有無を比較した。

| 条件 | 文書表示 | ツリー安定 | ready 後の JS Task | DOM ノード/行数 |
| --- | ---: | ---: | ---: | ---: |
| サイドバー OFF（1回目） | 850.8 ms | - | 82.4 ms | 507 nodes |
| サイドバー ON（1回目） | 1,138.3 ms | 1,183.3 ms | 356.1 ms | 1,814 nodes / 151 rows |
| サイドバー OFF（2回目） | 1,081.6 ms | - | 99.3 ms | - |
| サイドバー ON（2回目） | 1,171.1 ms | 1,224.7 ms | 328.8 ms | - |

原因は [`Sidebar.jsx`](../src/renderer/src/components/Sidebar.jsx) が、アクティブなタブだけでなく、復元された休眠中の全タブについて祖先ディレクトリを順番に読み込み、個別に React state を更新し、読み込んだ全ディレクトリに watcher を生成していることである。

一時ディスク上でも文書表示後に約 230–274 ms の追加 JavaScript 処理が発生した。低速ディスク、同期フォルダー、深いワークスペース、多数タブの実環境では増幅する可能性が高い。

### 3.4 バックグラウンドからの復帰

| 条件 | focus | 2 回の rAF | pointer 応答 | JS Task | 50 ms 超 Long Task |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 秒被覆 | 60.5 ms | 77.9 ms | 102 ms | 9.9 ms | なし |
| 3 秒最小化 | 46.1 ms | 55.7 ms | 77.6 ms | 8.6 ms | なし |
| 30 秒最小化 | 37.4 ms | 51.8 ms | 64.9 ms | 8.4 ms | なし |

この検証では、アプリのフォーカス処理に起因する停止は確認できなかった。一方、最小化後には GPU ワーキングセットが約 362 MB から 49–55 MB に、レンダラーが約 156 MB から約 139 MB に縮小した。

さらに 900 × 24 セル（21,624 セル）の大規模表を表示し、ワーキングセットを明示的に縮小した場合は次のとおりであった。

| 項目 | 縮小前 | 縮小後 |
| --- | ---: | ---: |
| Renderer working set | 約 420,596 KB | 約 86,156 KB |
| GPU working set | 約 433,868 KB | 約 42,132 KB |

復帰後の 2 rAF は 87.4 ms、pointer 応答は 129.1 ms で、長時間タスクは発生しなかった。Windows/GPU の再常駐化は有力な要因だが、利用者環境で見える数秒規模の停止をこの機材では再現できていないため、実機トレースが必要である。

なお、[`src/main/index.js`](../src/main/index.js) では Chromium のバックグラウンドスロットリング抑止スイッチと `backgroundThrottling: false` が既に設定されている。これはタイマーや描画フレームの抑制を防ぐ設定であり、Windows にワーキングセット保持を強制するものではない。

## 4. その他の確認事項

### 4.1 テーマ走査

アプリの初期マウント時に `themes:list` を呼び、ユーザーテーマ配下を深さ 4・最大 300 CSS まで再帰走査している。テーマ一覧は設定画面やモバイルのテーマ UI を開く際にも更新されるため、起動時走査は不要である。現在選択中のカスタムテーマ CSS は別の `themeRead(customTheme)` 経路で読み込まれるため、一覧の遅延取得で表示中テーマは失われない。

### 4.2 Google Fonts

[`app.css`](../src/renderer/src/styles/app.css) に Google Fonts の `@import` があるが、現行 CSP は外部 style/font を許可していない。実際にはブロックされてシステムフォントへフォールバックしているため、無効なネットワーク試行を削除する。将来フォントを固定する場合は、リモート依存ではなくアプリ同梱を検討する。

### 4.3 別プロセス起動の進行中変更

作業ツリーには、本調査以前から「第2インスタンスを軽量 bootstrap で受け、対象文書の描画後にフォーカスする」ための未確定変更が存在する。本調査ではその変更を保持し、今回の性能対応と混同しない。検証時には双方が同じ成果物に含まれる点を明記する。

## 5. 原因仮説と確度

| 仮説 | 対象 | 確度 | 根拠 |
| --- | --- | --- | --- |
| 全復元タブのサイドバー祖先読み込み・watcher 生成 | 起動 | 高 | ON/OFF 合成セッションで追加 JS と DOM 増加を再現 |
| 大きな未分割レンダラーバンドルの解析・初期実行 | 起動 | 高 | `responseEnd` 後から DOM interactive までが支配的、モジュール内訳も確認済み |
| 起動時のテーマ一覧再帰走査 | 起動 | 中 | コード経路は確認済み。テーマ数が多い環境ほど増幅 |
| Windows Defender/未署名バイナリのスキャン | 初回起動 | 中 | 初回のみ大きい傾向と Windows の既知動作に整合。個別トレース未取得 |
| Windows/GPU ワーキングセット縮小後の再常駐化 | 復帰 | 中 | 大幅な working set 縮小を観測。ただし数秒停止は未再現 |
| アプリの focus ハンドラー内の長時間 JS | 復帰 | 低 | 複数条件で 50 ms 超の long task なし |

## 6. 三段階の対応計画

### 第1次対応: 低リスクの起動クリティカルパス削減

今回実施する範囲である。

1. セッション復元時、サイドバーではアクティブタブの祖先だけを読み込む。休眠タブは実際に選択された時点で遅延展開する。
2. 複数ディレクトリの読み込みを重複排除・同時実行数制限付きでまとめ、React state 更新と watcher 同期を一括化する。
3. カスタムテーマ一覧の再帰走査を起動時から外し、テーマ UI/設定画面を開いた時に実行する。
4. renderer build に `minify: 'esbuild'` を明示する。
5. CSP により利用されていない Google Fonts の `@import` を削除する。
6. 単体テスト、lint、build、関連 E2E と同一条件の性能再計測を実施し、本書に結果を追記する。

受入条件:

- アクティブ文書の親ディレクトリは起動後に正しく展開される。
- 休眠タブを選択すると、その時点で対応する親ディレクトリが展開される。
- 同じディレクトリの並列読み込みを重複させず、1 回のバッチ内の最大同時実行数を制限する。
- カスタムテーマの適用とテーマ一覧更新が維持される。
- 既存テストに回帰がなく、30 タブ合成セッションで ready 後の JS Task と DOM 行数が明確に減る。

### 第2次対応: 軽量シェル先行表示とコード分割

第1次対応後も残る、レンダラー解析・実行コストを対象とする。

1. KeepEditor と Markdown 処理スタックを遅延 import し、タブ/タイトルバー/スプラッシュ解除に必要なシェルだけを先に起動する。
2. 設定、検索、コマンドパレット、履歴比較などのオプション UI を利用時ロードへ分離する。
3. デスクトップビルドから Capacitor/モバイルアダプターを除外する。
4. i18n 辞書をロケール単位のチャンクに分割する。
5. Crepe/エディターテーマ CSS の遅延読み込みと cascade layer を設計し、既存の CSS 順序要件を壊さず初期 CSS を縮小する。

受入条件は、スプラッシュ解除とシェル操作可能時点を別々に計測し、機能テストを維持したうえで初期 entry chunk と DOM interactive を削減することである。

### 第3次対応: 常駐量・実行基盤・配布形態の改善

長時間未使用後の復帰と大規模文書を含む構造的な課題を対象とする。

1. 非アクティブ editor の LRU 解放と、選択位置・スクロール・Undo を含む安全な状態復元を設計する。
2. 大規模表の行仮想化、または可視領域外の軽量表現を検討する。
3. Electron 34 から、サポート中の major へ段階的に更新する。クロスプラットフォーム、ProseMirror、window chrome、IPC、パッケージングの回帰試験を必須とする。
4. Windows コード署名を導入し、未署名バイナリに対する初回リアルタイムスキャンの影響を低減する。
5. 問題が再現する実機で ETW/WPA、Chrome trace、Process Monitor、GPU/working set を同時採取し、復帰時の停止を CPU・page fault・GPU・Defender・ディスク I/O に切り分ける。

## 7. 第1次対応の実施記録

### 実施前

- 状態: 完了
- 基準値: 3.1～3.3 を参照
- 注意: 作業ツリーに 4.3 の進行中変更あり

### 実施後

#### 実装内容

1. [`Sidebar.jsx`](../src/renderer/src/components/Sidebar.jsx)
   - 復元された全タブを起動時に reveal する effect を削除した。
   - アクティブ文書のみ祖先ディレクトリを読み込み、休眠タブは選択時に同じ経路で遅延 reveal するようにした。
   - 同一ディレクトリの進行中 IPC read を共有し、root 初期化と active reveal の重複 read を防止した。
   - root 初期化、watcher 更新、隠しファイル設定変更、祖先 reveal をバッチ読み込みへ移行し、1 バッチにつき 1 回の `childrenMap` 更新に集約した。
2. [`sidebar-tree.js`](../src/renderer/src/sidebar-tree.js)
   - 重複排除、入力順維持、最大 6 並列、ディレクトリ単位の失敗分離を行う `readDirectoriesBatched` を追加した。
3. [`App.jsx`](../src/renderer/src/App.jsx)
   - 初回マウントの `themes:list` 呼び出しを削除した。設定画面とモバイルテーマ選択 UI の open 時 refresh は維持した。
4. [`electron.vite.config.mjs`](../../electron.vite.config.mjs)
   - renderer build に `minify: 'esbuild'` を明示した。
5. [`app.css`](../src/renderer/src/styles/app.css)
   - CSP により利用されていなかった Google Fonts の `@import` を削除した。
6. [`perf-app.mjs`](../../scripts/perf-app.mjs)
   - 既に廃止された `Ctrl+/` title 依存の selector を、現行の単一 view-cycle button の安定した class/data contract へ更新した。
7. テスト
   - `readDirectoriesBatched` の重複排除・順序・失敗分離・最大並列数を単体テスト化した。
   - セッション再起動後は active branch のみ表示し、sleeping tab を選択するとその branch が展開される E2E を追加した。

#### バンドルサイズ

| 成果物 | 対応前 | 対応後 | 差分 |
| --- | ---: | ---: | ---: |
| 初期 entry JavaScript | 1,330,856 bytes | 約 772.23 KB | 約 42% 減 |
| 初期 CSS | 320,308 bytes | 約 227.33 KB | 約 29% 減 |

`Editor` chunk は minify 後も約 1.55 MB、entry は約 772 KB であり、Rollup の 500 KB 警告が残る。これは第2次対応でコード分割すべき対象として扱う。

#### 30 タブ合成セッション

同じ「30 branches × 深さ 4」の条件で再計測した。絶対 wall time は OS キャッシュと同時に含まれる進行中変更の影響で変動するため、サイドバーが追加した ready 後の処理量を主判定とする。

| 指標 | 対応前 | 対応後 | 評価 |
| --- | ---: | ---: | --- |
| tree rows | 151 | 35 | 約 77% 減 |
| DOM nodes | 1,814 | 624–630 | 約 65% 減 |
| 文書表示後 JS Task | 328.8–356.1 ms | 42.1–59.9 ms | 約 82–87% 減 |
| 文書表示 → tree 安定 | 約 45–53 ms | 約 7–9 ms | 約 80% 以上減 |
| 展開ディレクトリ | 全タブの祖先 | active tab の祖先 5 件 | 設計どおり |

対応後 3 回の詳細値は次のとおりである。

| sample | 文書表示 | tree 安定 | DOM interactive | rows | nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,152.3 ms | 1,158.9 ms | 603.9 ms | 35 | 630 |
| 2 | 1,216.4 ms | 1,224.5 ms | 622.9 ms | 35 | 630 |
| 3 | 1,305.4 ms | 1,314.3 ms | 638.4 ms | 35 | 630 |

追加の CDP Task 計測 2 回では、文書表示が 879.8 / 1,166.0 ms、表示後 250 ms 区間の Task が 59.9 / 42.1 ms、DOM nodes が 624、rows が 35 であった。文書表示の絶対時間は対応前のばらつき範囲と重なるため、「総起動時間が一定割合短縮した」とは判定しない。一方、今回対象とした全休眠タブの scan/render/watcher 負荷が解消されたことは、処理量の指標から確認できる。

#### 大規模表性能

900 × 24（21,624 cells）の既存 `perf-app` を 1 sample 実行し、全 budget check が pass した。

| 指標 | 計測値 |
| --- | ---: |
| first rows | 110.8 ms |
| table open wall | 1,224.0 ms |
| table Task | 1,052.0 ms |
| max Long Task | 220 ms |
| Total Blocking Time | 239 ms |

第1次対応による大規模文書操作の明確な回帰は認められない。1 sample のため、長期的な基準更新には使用しない。

#### 検証結果

- `npm run lint`: pass
- `npm test`: 51 files / 448 tests pass
- 関連 E2E: 9 cases pass（smoke、settings/tabs、sidebar keyboard、active-only restore を含む）
- 進行中の single-instance E2E: 1 case pass（4.3 の既存変更との併存確認）
- `npm run build`: pass
- `perf-app --no-check --runs=1`: 全 check pass
- `git diff --check`: pass

#### 残課題

- 初期 entry と `Editor` chunk は依然として大きい。全体の起動 wall time を安定して短縮するには第2次対応のシェル先行表示・コード分割が必要である。
- 復帰時の数秒停止は検証機で再現していない。今回の変更は起動負荷には効くが、Windows/GPU の再常駐化を直接解決するものではない。
- テーマ数が多い実環境における起動前後の I/O 差、および署名済み packaged build の Defender 差は未計測である。

## 8. 第2次対応の実施記録

### 実施状態

- 状態: 完了
- 実施日: 2026-08-01
- 目的: アプリシェルに不要な編集エンジン・低頻度 UI・モバイル専用依存を初期 entry から分離し、起動時の JavaScript 解析・実行量を削減する。

### 実装内容

1. [`App.jsx`](../src/renderer/src/App.jsx)
   - `KeepEditor` を `React.lazy` へ移行し、アプリシェルを先に描画してから active document に必要な editor chunk を読み込む構成にした。
   - 設定、コマンドパレット、ヘルプ、全文検索、アウトライン、リンク診断、履歴、PDF export、各種 dialog/toast を利用時ロードへ分離した。
   - editor および sidebar panel の遅延中に、レイアウトを保つ軽量な loading fallback を追加した。
2. [`find-blocks.js`](../src/renderer/src/find-blocks.js)
   - 行ジャンプ時だけ必要な Keep parser 依存を初期 find helper から分離した。行ジャンプ要求時に dynamic import し、要求対象が変わった場合は古い非同期結果を適用しない。
3. [`platform/index.js`](../src/renderer/src/platform/index.js)
   - Capacitor adapter を desktop の static dependency から外し、mobile build の場合だけ dynamic import するようにした。
   - `__MOBILE_BUILD__` を desktop/mobile の Vite 設定で明示し、desktop 成果物に Capacitor / native plugin code が混入しないことを確認した。
4. [`main.jsx`](../src/renderer/src/main.jsx)
   - platform API の準備後に React を mount する。汎用 Vite target でも動作するよう top-level await は使用していない。
   - Crepe theme CSS は既存の cascade 要件を守るため初期ロードを維持した。現状は `app.css` より前に読み込む順序が機能要件であり、単純な遅延化は editor の font-size 等を壊すためである。
5. i18n
   - 初期 entry の残存比率が比較的大きいことは確認したが、今回は分割していない。翻訳関数が同期 API で全画面から参照され、locale 定義の機械的分割だけでも影響範囲が大きいため、独立した互換性対応として扱う。

### バンドルサイズ

| 成果物 | 第1次対応後 | 第2次対応後 | 差分 |
| --- | ---: | ---: | ---: |
| 初期 entry JavaScript | 772.23 KB | 497.04 KB | 35.6% 減 |
| 初期 CSS | 227.33 KB | 227.87 KB | ほぼ同等 |
| `KeepEditor` | entry 内 | 74.21 KB の遅延 chunk | 初期 entry から分離 |
| Keep parser | entry 内 | 25.93 KB の共有遅延 chunk | 初期 entry から分離 |

調査開始時の未圧縮 entry 1,330,856 bytes と比較すると、初期 JavaScript は約 62.7% 小さくなった。desktop build の初期 entry は 500 KB 未満になり、desktop の全 JavaScript 成果物から Capacitor 関連文字列が消えた。`Editor`（Milkdown/Crepe）は約 1.55 MB の遅延 chunk のままであるが、該当モードを開くまで初期 entry の解析対象にはならない。

### 起動再計測

第1次対応後と第2次対応後の build を、毎回新規 user-data directory と同じ小規模 Markdown 文書で各 3 回起動した。`shell` は `#root .app`、`document` は Keep の `.km-doc` が表示された時点である。初回 sample は OS/Defender/ディスクの cold cache 影響が大きいため、2・3 回目も分けて記録する。

| sample | 第1次 shell | 第2次 shell | 第1次 document | 第2次 document | 第2次 shell → document |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,438.1 ms | 2,375.3 ms | 2,485.2 ms | 2,489.2 ms | 113.8 ms |
| 2 | 1,790.0 ms | 712.2 ms | 1,839.3 ms | 1,020.3 ms | 308.1 ms |
| 3 | 1,390.4 ms | 693.7 ms | 1,427.0 ms | 1,026.4 ms | 332.7 ms |

2・3 回目平均では shell が 1,590.2 ms から 703.0 ms（約 55.8% 減）、document が 1,633.2 ms から 1,023.4 ms（約 37.3% 減）になった。初回 cold start の document 表示はほぼ同等であり、未署名 Electron binary のリアルタイム scan や OS cold I/O が依然として支配的と考えられる。シェル先行表示により 114～333 ms の editor 遅延が明示的に生じるが、2・3 回目の document 到達時刻自体は短縮しており、遅延を後段へ移しただけではない。

この値は開発機上の unpacked build の少数 sample であり、製品 KPI の基準値にはしない。署名済み packaged build、利用者端末、Defender 条件を揃えた計測が別途必要である。

### 大規模文書性能

900 × 24（21,624 cells）の `perf-app` を 1 sample 実行し、全 budget check が pass した。

| 指標 | 第1次対応後 | 第2次対応後 |
| --- | ---: | ---: |
| first rows | 110.8 ms | 117.9 ms |
| table open wall | 1,224.0 ms | 1,259.2 ms |
| table Task | 1,052.0 ms | 1,028.0 ms |
| max Long Task | 220 ms | 204 ms |
| Total Blocking Time | 239 ms | 248 ms |

1 sample 間の変動範囲であり、今回のコード分割による大規模文書操作の明確な回帰は認められない。

### 検証結果

- `npm run lint`: pass
- `npm test`: 51 files / 448 tests pass
- `npm run build`: pass
- `npm run build:mobile`: pass
- 第2次対応の関連 E2E 35 cases: 34 pass、Milkdown context submenu 1 case が一時的に失敗したが、同 case の単独再実行は pass
- 最終 desktop build 後の主要 lazy route E2E: 12 cases pass（smoke、command palette、help、local history、settings/tabs、workspace search）
- `perf-app --no-check --runs=1`: 全 check pass

### 残課題

- 「長時間未使用後の復帰で数秒停止」は検証機では再現していない。第2次対応は renderer の再解析量と初回 mount を減らすが、Windows の working set trim、GPU process の再常駐化、Defender scan を直接制御するものではない。
- 初回 cold start はほぼ横ばいである。第3次対応では署名済み packaged build を対象に ETW/WPA または Process Monitor と Chrome trace を同時採取し、CPU、hard page fault、ディスク I/O、GPU、Defender のどこで停止しているかを切り分ける。
- i18n locale 分割と Crepe CSS 遅延化は、同期 API および cascade 順序の互換性設計を伴うため今回の範囲から除外した。効果を見積もってから独立対応する。

## 9. 第3次対応の実施記録

### 実施状態

- 状態: 第1波完了
- 実施日: 2026-08-01
- 目的: 長時間稼働・多数タブ利用後の renderer 常駐量を抑え、Windows が最小化中に working set / GPU resource を退避した後の復帰負荷を減らす。

### 対応前の追加基準値

12 個の中規模 Markdown（各 120 sections）を開き、全タブを一度ずつ表示して Keep editor を mount した。別に onboarding の Milkdown editor が 1 個存在する条件である。

| 指標 | 対応前 |
| --- | ---: |
| 常駐 Keep editor | 12 |
| 全 editor | 13 |
| DOM nodes | 44,290 |
| renderer working set | 341.6 MB |
| renderer private bytes | 388.3 MB |
| 5 秒最小化後の復帰 2 rAF | 110.3 ms |

process memory は OS の trim、GPU cache、計測順序による変動が大きい。常駐 editor 数と DOM nodes を主指標、working set/private bytes を補助指標として扱う。

### 実装内容

1. [`editor-residency.js`](../src/renderer/src/editor-residency.js)
   - 非表示 Keep editor の resident plan を純粋関数として分離した。
   - active/split/source-preview を常時保護し、clean な非活動 Keep reader は直近 3 個だけを warm set として保持する。
   - dirty、未確定 draft、Undo/Redo、table filter を持つ Keep editor、および全 Milkdown editor は上限なしで保持する。
   - activation 登録と pruning が同じ React commit で競合しても、新しい visible editor が古い `mountedIds` snapshot で消されない race guard を設けた。
2. [`App.jsx`](../src/renderer/src/App.jsx)
   - resident plan に従って安全な Keep reader のみを unmount する。
   - hibernate 前に scroll position、Markdown viewport offset、collapsed heading、table navigation context を保存し、再 mount 後に復元する。
   - editor API と viewport capture の rAF をタブ close 時に破棄し、registry 自体が増え続けないようにした。
3. [`perf-resume.mjs`](../scripts/perf-resume.mjs)
   - 12 文書を順番に訪問し、常駐 editor/DOM/process memory、5 秒最小化後の 2 rAF、hibernate reader の reopen、scroll restore を測る再現可能な benchmark を追加した。
   - `npm run perf:resume` は budget check 付き、`npm run perf:resume:measure` は計測のみで実行できる。
4. テスト
   - resident plan の安全条件と visible-id race を単体テスト化した。
   - clean reader の hibernate/scroll restore、および Undo history を持つ Keep editor が resident のままであることを Electron E2E で固定した。
5. [`AGENTS.md`](../AGENTS.md)
   - lazy mount の load-bearing rule を、新しい Keep resident policy と visible-id race guard を含む内容へ更新した。

### 対応後の計測

対応前と同じ 12 文書条件で 3 回計測した。構造指標は 3 回とも同一である。

| 指標 | 対応前 | 対応後 | 評価 |
| --- | ---: | ---: | --- |
| 常駐 Keep editor | 12 | 4 | 66.7% 減 |
| 全 editor | 13 | 5 | 61.5% 減 |
| DOM nodes | 44,290 | 16,354 | 63.1% 減 |
| 復帰 2 rAF | 110.3 ms（1 sample） | 70.7 / 75.8 / 87.4 ms | 平均 78.0 ms |
| hibernate reader reopen | 未計測 | 231.7 / 234.9 / 294.8 ms | 平均 253.8 ms |
| scroll restore ratio | 未計測 | 0.701 / 0.701 / 0.701 | 復元確認 |

対応後の renderer working set は最小化前 51.9～350.9 MB、最小化中 60.5～113.5 MB、復帰直後 80.3～129.0 MB と大きく変動した。Windows の trim timing に依存するため削減率は算出しないが、保持する DOM/Blink 構造そのものは約 63% 減っている。利用者が休眠済み reader へ戻る場合は約 0.23～0.30 秒の再構築コストが発生する。直近 3 reader を warm に残すことで、通常の隣接タブ往復は従来どおり即時である。

### 大規模文書性能

900 × 24（21,624 cells）の `perf-app` を再実行し、全 budget check が pass した。

| 指標 | 計測値 |
| --- | ---: |
| first rows | 135.6 ms |
| table open wall | 1,302.7 ms |
| table Task | 1,154.5 ms |
| max Long Task | 220 ms |
| Total Blocking Time | 284 ms |

単一 sample ではあるが、既存 budget 内であり、resident policy による active large document 操作の明確な回帰は認められない。

### 検証結果

- `npm run lint`: pass
- `npm test`: 52 files / 453 tests pass
- resident policy E2E: 2 cases pass
- 関連 E2E: 45 cases pass（Keep draft/history、Milkdown、split、preview、tab history、local history を含む）
- `npm run build`: pass
- `npm run build:mobile`: pass
- `perf-resume --runs=3`: 15/15 budget checks pass
- `perf-app --no-check --runs=1`: 全 check pass

### Electron 更新・署名・実機 trace の判断

- 実測 runtime は Electron 34.5.8 である。2026-08-01 時点の公式サポート対象は最新 3 stable major の 41/42/43 であり、34 はサポート外である。
- 34 から現行 43 への変更は 9 major を跨ぎ、Chromium、Node.js、preload、window chrome、GPU、macOS の回帰面が大きい。今回の resident policy と混在させると原因比較も困難になるため、独立した compatibility batch で段階的に実施する。
- Windows code signing は証明書と外部権限が必要であり、本対応だけでは完結しない。署名済み installer と未署名 unpacked build の Defender 初回差は未計測である。
- 検証機には `wpr.exe` が存在するが、WPA/Process Monitor は PATH 上にない。数秒停止を実機で再現できる場合は、Windows ADK の WPA を用意し、`perf-resume` と同時に ETW、Chrome trace、hard page fault、disk I/O、GPU、Defender を採取する。

### 残課題

- 本対応は多数の既読 Keep tab に対して有効である。一つの巨大 active document 自体の resident size は削減しない。
- Milkdown editor は Undo/selection state を安全に外部化できていないため hibernate 対象外である。Milkdown を多数常駐させる利用形態では別設計が必要になる。
- Electron 43 系への更新、Windows code signing、実機 ETW 分析は、それぞれ独立して回帰確認・権限・環境準備を必要とする。

## 10. 参考資料

- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron Releases and support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Electron stable releases](https://releases.electronjs.org/?channel=stable)
- [Windows app performance: disk and memory](https://learn.microsoft.com/en-us/windows/apps/develop/performance/disk-memory)
- [Troubleshoot Microsoft Defender Antivirus performance](https://learn.microsoft.com/en-us/defender-endpoint/troubleshoot-performance-issues)
- [Electron Release Schedule](https://releases.electronjs.org/schedule)
