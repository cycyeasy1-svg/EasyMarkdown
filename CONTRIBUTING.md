# EasyMarkdown への貢献

ご協力ありがとうございます。変更は一つの目的に集中させ、risk に応じた最小限の設計・test evidence とともに Pull Request を作成してください。

## 開発環境

```bash
git clone https://github.com/cycyeasy1-svg/EasyMarkdown.git
cd EasyMarkdown
npm install
npm install --prefix packages/vscode-extension
npm run dev
```

Electron download が遅い場合は、install 前に `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` を設定する。Build、package、E2E の詳細は [開発・構建・測試](./docs/development.md)、AI agent の project rule は [AGENTS.md](./AGENTS.md) を参照する。

## 変更 workflow

1. Issue／目的、対象範囲、non-goal を確認する。
2. [Feature Dossier 運用規約](./docs/feature-dossiers/README.md) に従い S／M／L risk を判断する。M／L は実装前に AC を確定する。
3. Existing source を一括整形せず、`npm run format` で current branch の新規／変更 file だけを整形する。
4. Risk に応じた unit／integration／E2E と document を更新する。
5. Pull Request template に test result、platform impact、rollback、residual risk を記載する。

## Pull Request 前の確認

```bash
npm run format:check
npm run architecture:check
npm run quality:fast
npm run dependencies:check
```

UI／Electron lifecycle を変更した場合は built app で `npm run test:e2e:smoke:built` も実行する。すべての変更は [Definition of Done](./docs/definition-of-done.md) の共通条件と risk 別条件に従う。User-facing change は [CHANGELOG.md](./CHANGELOG.md) の `Unreleased` も更新する。

## Bug report／feature request

GitHub の Issue template を使用し、OS、app version、再現手順、期待結果、実際の結果を記載する。Credential、private document、不要な absolute path は添付しない。

## Commit message

命令形で目的が分かる短い subject を使用する。厳密な prefix 規則より、一つの commit が一つの論理変更を表すことを優先する。

## License

Contribution は repository の [MIT License](./LICENSE) に従う。
