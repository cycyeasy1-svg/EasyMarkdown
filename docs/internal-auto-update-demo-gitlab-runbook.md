# EasyMarkdown 社内自動更新 Demo 実験手順書

## 1. この手順書で確定している環境

| 項目 | 値 |
| --- | --- |
| GitLab ホスト | `http://gitlab-internal.sh` |
| GitLab プロジェクト | `ai-hub/tools` |
| ブランチ | `master` |
| GitLab 上の配置先 | `easymarkdown/update-demo` |
| クライアント更新元 | `http://gitlab-internal.sh/ai-hub/tools/-/raw/master/easymarkdown/update-demo/` |
| クライアントの読取認証 | 不要 |
| 対象 OS | Windows x64 |
| 初期版 | `90.0.1` |
| 更新版 | `90.0.2` |

GitLab のブラウザー URL
`http://gitlab-internal.sh/ai-hub/tools/-/tree/master/easymarkdown?ref_type=heads`
から Raw URL を組み立てている。

本 Demo のアプリ名は `EasyMarkdown Update Demo`、appId は
`com.easymarkdown.update-demo` である。正式版 EasyMarkdown とは別アプリとして
インストールされるため、正式版の更新方法、設定、`.md` 関連付けに影響しない。

## 2. 持込み成果物

展開後の構成は次のとおり。

```text
dist-update-demo-handoff/
├─ 01-initial-installer/
│  └─ EasyMarkdown Update Demo-90.0.1-win-x64.exe
├─ 02-publish-to-gitlab/
│  ├─ EasyMarkdown Update Demo-90.0.2-win-x64.exe
│  ├─ EasyMarkdown Update Demo-90.0.2-win-x64.exe.blockmap
│  └─ latest.yml
├─ 03-tools-and-runbook/
│  ├─ Deploy-UpdateDemo.ps1
│  ├─ Test-UpdateDemoFeed.ps1
│  └─ README-FIRST.md
├─ 04-source-snapshot/
└─ SHA256SUMS.txt
```

通常の実験では `01`〜`03` だけを使う。Node.js、npm、外部ネットワーク、社内 AI、
再ビルドは不要である。`04-source-snapshot` は調査・再ビルド用の予備である。

## 3. 重要な制約

1. 実験用インストーラーは未署名である。Windows SmartScreen が表示された場合は、
   ファイル名と入手元を再確認してから「詳細情報」→「実行」を選ぶ。
2. 現在の GitLab は HTTP である。`latest.yml` とインストーラーを同時に改ざんできる
   攻撃には SHA-512 だけでは対抗できない。管理された社内ネットワークでの Demo に
   限定し、本番導入前に HTTPS とコード署名を必須とする。
3. インストーラーを Git リポジトリへ継続的に追加するとリポジトリが肥大化する。
   Demo 合格後は専用プロジェクト、GitLab Pages、Package Registry、または社内静的
   Web サーバーへ移行する。
4. トークン、パスワードをアプリ、`latest.yml`、リポジトリへ書き込まない。

## 4. 内網へ持ち込んだ直後の完全性確認

ZIP と同じ場所にある `dist-update-demo-handoff.zip.sha256` を使う。

```powershell
Get-FileHash .\dist-update-demo-handoff.zip -Algorithm SHA256
Get-Content .\dist-update-demo-handoff.zip.sha256
```

二つのハッシュ値が一致したら ZIP を展開する。展開後の全ファイルを確認する場合:

```powershell
Set-Location .\dist-update-demo-handoff
Get-Content .\SHA256SUMS.txt
```

`SHA256SUMS.txt` は障害時の個別ファイル照合用である。

## 5. 更新ファイルを GitLab へ配置する

### 5.1 リポジトリを準備する

書込み権限を持つ担当者が実行する。既存 clone がある場合はそれを利用できる。

```powershell
git clone http://gitlab-internal.sh/ai-hub/tools.git C:\work\tools
git -C C:\work\tools switch master
git -C C:\work\tools pull --ff-only
```

未コミット変更がある共有作業ツリーは使わない。

### 5.2 三つの更新ファイルをコピーして stage する

`03-tools-and-runbook` で実行する。

```powershell
Set-Location .\03-tools-and-runbook
.\Deploy-UpdateDemo.ps1 `
  -RepositoryPath C:\work\tools `
  -StageWithGit
```

このスクリプトは次を検査する。

- Git remote が `ai-hub/tools` である。
- 現在ブランチが `master` である。
- `latest.yml`、対象 `.exe`、`.blockmap` が揃っている。
- 配置先が `easymarkdown/update-demo` である。

スクリプトは commit と push を行わない。内容を確認する。

```powershell
git -C C:\work\tools status --short
git -C C:\work\tools diff --cached --stat
```

問題がなければ GitLab の運用規則に従って commit・push する。

```powershell
git -C C:\work\tools commit -m "chore: EasyMarkdown 自動更新 Demo 90.0.2 を配置"
git -C C:\work\tools push origin master
```

`master` が保護ブランチの場合は、作業ブランチへ commit・push して Merge Request を
作成し、`master` へ merge する。更新クライアントは `master` の Raw URL を参照するため、
merge 前には更新が見えない。

## 6. 匿名ダウンロードを検証する

GitLab にログインしていない別の社内 Windows PC で実施することが望ましい。

最初にメタデータだけを確認する。

```powershell
Set-Location .\03-tools-and-runbook
.\Test-UpdateDemoFeed.ps1 -MetadataOnly
```

`Manifest version: 90.0.2` と `Metadata check passed.` が表示されること。

次にインストーラー、SHA-512、blockmap を含む完全確認を行う。約 86 MB を
ダウンロードする。

```powershell
.\Test-UpdateDemoFeed.ps1
```

最後に次が表示されれば更新元は正常である。

```text
Feed check passed: version 90.0.2
The manifest, installer SHA-512, and blockmap are valid.
```

ログイン画面、404、プロキシのエラーページが返る場合はスクリプトが失敗する。
その状態でアプリ実験へ進まない。

## 7. 90.0.1 → 90.0.2 の正常更新試験

1. 正式版 EasyMarkdown を終了する必要はない。
2. `01-initial-installer\EasyMarkdown Update Demo-90.0.1-win-x64.exe` を実行する。
3. インストール完了後、`EasyMarkdown Update Demo` を起動する。
4. 約 4 秒待つ。
5. 更新カードに `90.0.2` が表示されることを確認する。
6. 「今すぐ更新」を押す。
7. ダウンロード進捗が増えることを確認する。
8. 「再起動してインストール」を押す。
9. アプリが終了し、サイレント更新後に再起動することを確認する。
10. Welcome 画面のバージョンが `90.0.2` であることを確認する。
11. 再起動後、同じ更新カードが再表示されないことを確認する。

## 8. 必須の追加検証

### T01 正常更新

第 7 章を実施し、`90.0.1 → 90.0.2` が成功する。

### T02 更新なし

`90.0.2` へ更新済みの状態で再起動する。更新カードが表示されず、編集・保存できる。

### T03 社外または GitLab 停止

更新前の `90.0.1` を別 PC にインストールし、社外ネットワークまたは GitLab に
到達できない状態で起動する。起動が停止せず、更新カードも出ず、編集・保存できる。

### T04 未保存文書

未保存変更を作ってから更新をダウンロードし、「再起動してインストール」を押す。
既存の未保存確認が表示され、キャンセルすると編集を継続できる。

### T05 破損検知

共有 GitLab のファイルを破損させず、ローカル HTTP サーバーを使う専用試験として行う。
別フォルダーへ三ファイルをコピーし、`.exe` の末尾へ 1 byte 追加する。
そのフォルダー向けにビルドされたテストクライアントで SHA-512 エラーになることを確認する。
本成果物は GitLab URL 固定済みのため、この試験を省略する場合は「未実施」と記録する。

### T06 公開版の非干渉

正式版 EasyMarkdown を起動し、従来どおり利用できることを確認する。正式版は
GitLab Raw URL を参照せず、従来の GitHub 更新通知または ZIP 上書き経路を維持する。

### T07 正式版との共存

正式版と Demo を同じ PC へインストールし、個別に起動・アンインストールできること、
`.md` 関連付けと Explorer メニューが Demo に奪われないことを確認する。

## 9. 判定記録

次の表をコピーして試験記録へ使用する。

| ID | 実施日時 | PC/Windows | 操作結果 | 期待結果 | 合否 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | | | | | | |
| T02 | | | | | | |
| T03 | | | | | | |
| T04 | | | | | | |
| T05 | | | | | | |
| T06 | | | | | | |
| T07 | | | | | | |

合格条件は T01、T02、T03、T04、T06、T07 がすべて Pass である。T05 を省略した場合は、
正式導入前に別更新 URL を使う検証ビルドで必ず実施する。

## 10. 中止・ロールバック

### 更新配信を止める

GitLab で `easymarkdown/update-demo/latest.yml` を削除または別名へ変更する commit を
`master` へ反映する。既に起動中のクライアントにはエラーを強制表示せず、通常利用を
継続させる。

### PC から Demo を削除する

Windows の「インストールされているアプリ」から `EasyMarkdown Update Demo` を
アンインストールする。正式版 EasyMarkdown とユーザーの Markdown ファイルは削除されない。

### 不具合修正版を出す

`90.0.2` を配布した後に `90.0.1` へ戻さない。修正版は必ず `90.0.3` 以上で作成する。
異なるビルドの `.exe`、`.blockmap`、`latest.yml` を混在させない。

## 11. Demo 合格後

今回の URL は実験専用とし、全社配布へそのまま転用しない。正式導入では少なくとも次を
完了させる。

- HTTPS の匿名読取専用更新 URL
- Windows コード署名
- EasyMarkdown 本体と社内版の正式な appId・名称・バージョン規約
- GitLab CI による三ファイルの同時生成・公開
- 配布承認、段階配布、緊急停止、監査ログ
- Git リポジトリを肥大化させない更新 asset 保管方式

実装全体の設計と再ビルド方法は、ソーススナップショット内
`docs/internal-auto-update-demo.md` を参照する。
