# EasyMarkdown Lite

EasyMarkdown の Keep モードを共有する、バックエンド不要のローカル Web 版です。
Electron デスクトップ版および VS Code 拡張のエントリポイントから独立しており、
ビルド成果物は `dist-web-lite/` に出力されます。

## ビルド

```powershell
npm run build:web-lite
```

生成後、`dist-web-lite/index.html` を Microsoft Edge または Google Chrome で
直接開きます。成果物は ES Module を使用しない IIFE バンドルであり、HTTP
サーバーなしの `file://` 起動を前提とします。

## 対応範囲

- File System Access API による Markdown ファイル／フォルダーの選択
- Keep モードの安全な Markdown／HTML 表示と差分を限定した編集
- テーブル編集、フィルター、タスク切替、Mermaid、KaTeX、Undo／Redo
- 複数タブ、アウトライン、相対画像、内部文書リンク、外部変更通知
- Source button の open／close toggle、preview scroll、source-to-preview scroll sync
- 本文幅、文字サイズ、zoom、行間、段落／見出し間隔、言語別／code font の調整
- Current file path、保存状態、table filter count／解除を確認できる status bar
- UTF-8 BOM および CRLF/LF の保持

リアルタイム監視、Explorer 統合、既定アプリ登録、ネイティブメニュー、
自動更新は対象外です。ブラウザーポリシーが直接書き込みを禁止する場合は、
ダウンロード保存へフォールバックします。

## 保守方針

Keep の解析・サニタイズ・書式・Mermaid・テーブル実装は
`src/renderer/src/` を直接参照し、このパッケージ内へ複製しません。
Web 固有の責務は `browser-files.js` と軽量シェルに限定します。
