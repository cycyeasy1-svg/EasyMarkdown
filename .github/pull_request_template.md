## 概要

<!-- 何を変更したかを 1〜3 項目で記載してください。 -->

-

## 背景・目的

<!-- なぜ必要か、利用者／開発者のどの問題を解決するかを記載してください。 -->

## Risk と設計資料

- [ ] S — 局所修正。Issue／再現条件／回帰 test を記載した
- [ ] M — 通常機能。Feature Dossier と AC-ID を記載した
- [ ] L — Platform／data／IPC／security／release 変更。Dossier、ADR、security／migration／rollback を記載した

Feature Dossier／Issue:

## 対象 product／platform

- [ ] Desktop Windows
- [ ] Desktop macOS
- [ ] Mobile iOS
- [ ] Mobile Android
- [ ] VS Code extension
- [ ] Website
- [ ] Shared／document／tooling only

非対象範囲:

## 検証 evidence

<!-- 実行した command と結果を記載し、未実施項目は理由を説明してください。 -->

```text
npm run format:check
npm run quality:fast
```

Manual evidence:

## 影響確認

- [ ] Security／privacy／credential／IPC の影響を確認した、または変更なし
- [ ] Accessibility／keyboard／contrast の影響を確認した、または変更なし
- [ ] Performance／startup／bundle の影響を確認した、または変更なし
- [ ] i18n／長文／CJK／overflow の影響を確認した、または変更なし
- [ ] Session／settings／file format／migration の影響を確認した、または変更なし
- [ ] Product Support Matrix／release evidence／user document を更新した、または変更なし

## Rollback と残存 risk

Rollback:

Residual risk／follow-up:

## Definition of Done

- [ ] [Definition of Done](https://github.com/cycyeasy1-svg/EasyMarkdown/blob/main/docs/definition-of-done.md) の共通条件と risk 別条件を満たした
- [ ] 関連 source of truth、Dossier、ADR、test mapping、`last_verified` を更新した
- [ ] Required CI が成功し、未解決 blocker がない
