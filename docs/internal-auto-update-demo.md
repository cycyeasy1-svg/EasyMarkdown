# 社内向け自動更新 Demo 配布・試験引継ぎ手順

> `gitlab-internal.sh/ai-hub/tools` 向けにビルド済み成果物を使って実験する場合は、
> [internal-auto-update-demo-gitlab-runbook.md](./internal-auto-update-demo-gitlab-runbook.md)
> を先に参照する。社内 AI と再ビルドは不要である。

## 1. 文書の目的

この文書は、EasyMarkdown の社内向け自動更新 Demo を社内 GitLab 環境へ移し、
配布・更新試験を継続する担当者または AI への引継ぎ資料である。

対象ブランチ:

```text
codex/internal-auto-update-demo
```

Demo は Windows x64 / NSIS インストーラー専用である。正式版の更新方式を置き換える
ものではなく、以下の経路だけを検証する。

```text
社内更新元
  → 最新版メタデータ取得
  → NSIS インストーラーのダウンロード
  → SHA-512 検証
  → アプリ再起動
  → 上書きインストール
```

## 2. 絶対に維持する分離条件

社内版と公開版をネットワーク到達性だけで判定してはならない。VPN、社外利用、
GitLab 障害などで誤判定するためである。

本 Demo は、次の二つのゲートが同時に成立した場合だけ自動更新を有効化する。

1. ビルド時に `EASYMARKDOWN_INTERNAL_UPDATE_DEMO=1` が定義されている。
2. パッケージ内 `resources/distribution.json` が次の完全一致条件を満たす。

```json
{
  "schemaVersion": 1,
  "distribution": "internal-demo",
  "autoUpdate": true
}
```

通常の `npm run build`、`npm run dist`、`npm run pack` ではゲートが成立しない。
公開版は従来どおり GitHub の最新版通知と ZIP 上書き配布を使用し、社内 GitLab へ
アクセスしない。通常ビルドの `out/main/` に updater chunk が生成されないことも
確認済みである。

この分離条件を変更してはならない。特に「GitLab に接続できたら社内ユーザーとみなす」
実装へ変更しないこと。

## 3. Demo 固有のアプリ識別子

正式版との衝突を避けるため、Demo は別アプリとして生成される。

| 項目 | Demo 値 |
| --- | --- |
| `appId` | `com.easymarkdown.update-demo` |
| Product name | `EasyMarkdown Update Demo` |
| 出力先 | `dist-update-demo/` |
| 更新キャッシュ | `easymarkdown-update-demo-updater` |

Demo ビルドでは正式版のファイル関連付けと `build/installer.nsh` を外している。
したがって `.md` の既定アプリや Explorer の正式版コンテキストメニューを奪わない。

## 4. 実装ファイル

主なファイルは次のとおり。

| ファイル | 役割 |
| --- | --- |
| `src/main/internal-updater.js` | `electron-updater` の状態管理、確認、ダウンロード、インストール |
| `src/main/index.js` | Demo 専用遅延ロード、IPC、終了ガード連携 |
| `src/main/helpers.js` | 配布マーカーの fail-closed 検証、更新ノート正規化 |
| `src/preload/index.js` | 更新 IPC を安全に renderer へ公開 |
| `src/renderer/src/App.jsx` | 更新状態、未保存文書確認、操作制御 |
| `src/renderer/src/components/UpdateToast.jsx` | ダウンロード進捗、再起動、再試行 UI |
| `electron-builder.internal-demo.mjs` | 正式版から分離した Demo パッケージ設定 |
| `scripts/build-update-demo.mjs` | バージョンと更新元を注入してビルド |
| `build/internal-update-demo.json` | Demo 専用配布マーカー |
| `test/main-helpers.test.js` | 配布ゲートの単体テスト |

`package.json` の正式バージョンは Demo ごとに変更しない。ビルドコマンドの
`--version` がパッケージと画面表示へ注入される。

## 5. 事前条件

- Windows x64 のビルド端末
- Node.js と npm
- `npm install` 済みの作業ツリー
- 社内 PC から到達可能な HTTP(S) 更新元
- HTTPS の場合、社内 CA がクライアント Windows の信頼済みルートへ登録済み
- 初回配布用 NSIS インストーラー

自動更新は ZIP/portable 版を直接置き換えない。社内 Demo ユーザーは最初に一度、
NSIS インストーラーを実行する必要がある。

## 6. 推奨する最初の試験: Generic HTTP(S)

GitLab 固有設定を切り離して更新機構だけを確認できるため、最初は固定ディレクトリを
配信する Generic provider を推奨する。GitLab Pages、社内静的 Web サーバー、
リバースプロキシ配下のディレクトリを利用できる。

例の更新元:

```text
https://updates.example.local/easymarkdown-demo/
```

### 6.1 初期版 90.0.1 の作成

```powershell
npm ci
npm run dist:update-demo -- `
  --version 90.0.1 `
  --provider generic `
  --url https://updates.example.local/easymarkdown-demo
```

`dist-update-demo/` に少なくとも次の三ファイルが生成される。

```text
EasyMarkdown Update Demo-90.0.1-win-x64.exe
EasyMarkdown Update Demo-90.0.1-win-x64.exe.blockmap
latest.yml
```

初期版インストーラーをテスト PC に手動インストールする。

### 6.2 更新版 90.0.2 の作成

同一 URL を指定し、より大きいバージョンをビルドする。

```powershell
npm run dist:update-demo -- `
  --version 90.0.2 `
  --provider generic `
  --url https://updates.example.local/easymarkdown-demo
```

### 6.3 配置順序

更新元へ次の順序でアップロードする。

1. 新しい `.exe`
2. 新しい `.exe.blockmap`
3. 最後に `latest.yml`

`latest.yml` を最後にすること。先に公開すると、クライアントがまだ存在しない
インストーラーを取得しようとする。

過去のインストーラーと blockmap は試験終了まで削除しない。

### 6.4 簡易ローカル試験

社内更新元を用意する前の確認には、更新ファイルのディレクトリで一時 HTTP サーバーを
起動できる。次は Python がインストール済みの場合の例である。

```powershell
Set-Location dist-update-demo
python -m http.server 8080
```

この場合、ビルド時 URL は `http://127.0.0.1:8080` とする。ローカル試験以外では
HTTPS を推奨する。

## 7. GitLab provider を直接使う場合

`electron-builder` の GitLab provider も設定済みである。社内 GitLab のプロジェクトが
クライアントから匿名読み取り可能である場合に使用する。

PowerShell 例:

```powershell
$env:GITLAB_TOKEN = '<build-or-ci-only-token>'

npm run dist:update-demo -- `
  --version 90.0.1 `
  --provider gitlab `
  --host gitlab.example.local `
  --project-id group/easymarkdown-update-demo `
  --publish
```

`GITLAB_TOKEN` はビルド/CI から GitLab へアップロードするためだけに使用する。
トークンをソース、`distribution.json`、`app-update.yml`、インストーラー、CI ログへ
書き込んではならない。

プロジェクトが private の場合、ブラウザーで全社員がログインできてもデスクトップ
アプリはそのログインセッションを共有しない。次のいずれかを選ぶ。

1. 社内ネットワーク内に限り更新プロジェクトまたは更新 asset を匿名読み取り可能にする。
2. 認証済み GitLab から取得したファイルを、匿名読み取り専用の社内更新ゲートウェイへ同期する。
3. Generic provider と社内リバースプロキシを使用する。

長期 PAT、Project Access Token、Deploy Token をクライアントへ埋め込む方式は禁止する。
デスクトップアプリから抽出でき、全配布済みクライアントのローテーションが必要になるためである。

社内 GitLab のバージョン、公開レベル、Package Registry、Release API の仕様に差異が
ある場合は、Generic provider へ戻して試験する。

## 8. UI と終了動作

起動約 4 秒後に更新確認を行う。最新版がある場合:

1. 「今すぐ更新」を押す。
2. 進捗率を表示しながらダウンロードする。
3. 完了後「再起動してインストール」を表示する。
4. 未保存タブがある場合は既存の終了確認を表示する。
5. 確認後、`electron-updater.quitAndInstall(true, true)` を呼び出し、サイレント更新して再起動する。

更新元が到達不能なだけでは更新カードを表示しない。起動、編集、保存を妨げない。
ユーザーが更新操作を開始した後のエラーだけをカード内へ表示する。

## 9. 必須試験ケース

### T01: 正常更新

- 90.0.1 をインストールする。
- 更新元へ 90.0.2 を公開する。
- 更新カードが表示される。
- ダウンロード進捗が表示される。
- 再起動後の表示バージョンが 90.0.2 になる。

### T02: 更新なし

- インストール済みと `latest.yml` を同じバージョンにする。
- 更新カードが表示されない。

### T03: 社外/更新元停止

- DNS、VPN または更新 Web サーバーを停止する。
- アプリ起動がブロックされない。
- 編集と保存が正常に動く。
- バックグラウンド確認失敗だけではエラーカードが表示されない。

### T04: 未保存文書

- 未保存の変更を作る。
- 更新をダウンロードし、「再起動してインストール」を押す。
- 既存の未保存確認が表示される。
- キャンセルするとインストールせず編集を継続できる。

### T05: 破損ファイル

- `latest.yml` 公開後に `.exe` のバイトを変更する。
- SHA-512 不一致でインストールされない。
- 「再ダウンロード」が表示される。
- 試験後は正しい成果物三点を同じビルドから再配置する。

### T06: 公開版の非干渉

- 環境変数なしで `npm run build` を実行する。
- `out/main/` に `internal-updater-*.js` が存在しない。
- 公開版 resources に `distribution.json` が存在しない。
- 公開版が社内 GitLab へリクエストしない。
- 既存の GitHub 通知と ZIP 配布経路が変わらない。

### T07: 正式版との共存

- 正式版と `EasyMarkdown Update Demo` を同じ PC にインストールする。
- 両方を個別に起動・アンインストールできる。
- `.md` 関連付けと正式版 Explorer メニューが Demo に奪われない。

## 10. 成果物検査

ビルド後:

```powershell
Get-ChildItem dist-update-demo
Get-Content dist-update-demo\latest.yml
Get-Content dist-update-demo\win-unpacked\resources\app-update.yml
Get-Content dist-update-demo\win-unpacked\resources\distribution.json
```

期待値:

- `latest.yml` の `version` が指定値と一致する。
- `latest.yml` の `path` が実在する `.exe` と一致する。
- `app-update.yml` が意図した社内 provider/URL を指す。
- `distribution.json` が `internal-demo` を示す。
- `.exe`、`.blockmap`、`latest.yml` が同一ビルドの成果物である。

通常ビルドの分離確認:

```powershell
npm run build
Get-ChildItem out\main -Recurse
Select-String -Path out\main\* -Pattern 'Internal demo update channel enabled'
```

最後の検索結果は空でなければならない。

## 11. コード品質確認

変更後は次を順番に実行する。`npm run build` と `npm run lint` を同時実行すると、
Vite の一時 config ファイルを ESLint が走査する競合が起きるため、直列実行する。

```powershell
npm run lint
npm test
npm run build
```

Demo パッケージ確認:

```powershell
npm run dist:update-demo -- `
  --version 90.0.1 `
  --provider generic `
  --url http://127.0.0.1:8080
```

## 12. ロールバック

Demo は正式版と別 `appId` なので、試験失敗時は Demo をアンインストールし、
更新元の `latest.yml` を非公開にすればよい。正式版とユーザー文書の復元は不要である。

既にあるバージョンを配布した後、低いバージョンへ自動ダウングレードしないこと。
修正時は必ずより高いバージョンを公開する。

```text
誤り: 90.0.2 → 90.0.1 へ戻す
正解: 修正版 90.0.3 を公開する
```

更新元を戻す場合も、`.exe`、`.blockmap`、`latest.yml` を別ビルド間で混在させない。

## 13. 正式導入前に追加すべき項目

Demo 合格後も、そのまま全社員へ展開しない。正式導入前に次を決める。

- Windows コード署名証明書と発行者検証
- 社内安定版の appId / Product name / 更新 URL
- CI の保護変数、承認、tag と version の規約
- 段階配布と停止手順
- 更新失敗ログの保存先
- 社内版と公開版の全体バージョン規約
- インストーラーの初回配布方法
- GitLab 障害時の運用窓口

macOS は署名済みアプリが自動更新の前提であり、本 Demo の対象外である。

## 14. 内部 AI へ渡す開始指示

以下をこの文書と一緒に渡す。

```text
AGENTS.md と docs/internal-auto-update-demo.md を最初に全文読んでください。
codex/internal-auto-update-demo ブランチを使用し、公開版の更新経路を変更しないでください。
まず社内 GitLab の公開レベル、HTTPS 証明書、GitLab バージョン、
Release/Package Registry/Pages の利用可否を読み取り確認してください。
確認結果に基づき Generic provider または GitLab provider を一つ選び、
90.0.1 → 90.0.2 の Windows NSIS 更新試験を実施してください。
トークンをクライアントやリポジトリへ埋め込まないでください。
試験結果は T01〜T07 ごとに、実行コマンド、観測結果、ログ、合否を記録してください。
```

## 15. 参照資料

- electron-builder Auto Update:
  <https://www.electron.build/docs/features/auto-update/>
- electron-builder Publish / GitLab provider:
  <https://www.electron.build/docs/publish/>
- GitLab Generic Packages:
  <https://docs.gitlab.com/user/packages/generic_packages/>
- GitLab Releases:
  <https://docs.gitlab.com/user/project/releases/>
