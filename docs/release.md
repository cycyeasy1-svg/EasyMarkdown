# EasyMarkdown リリース手順

本書は、EasyMarkdown の desktop 正式版を GitHub Release へ公開するための手順と品質ゲートを定義する。Mobile と VS Code 拡張は独立した version／配布 cadence を持つ。

> local で作成する desktop package は未署名の場合がある。公式 tag workflow は fail-closed とし、Windows code signing と macOS signing／notarization の credential がない場合は publish しない。初回の署名済み release 実績、checksum／provenance は P1-3 の残課題として確認すること。

## 1. Tag 作成前

### 1.1 Version とリリースノート

version は 11 箇所に存在するため手動変更しない。

```bash
npm run version:check
npm run version:bump -- 1.5.0
```

- `scripts/bump-version.mjs` を version 情報の source of truth とする。
- `RELEASE_NOTES.md` を end user 向けに更新する。
- shortcut／setting を変更した場合は `src/renderer/src/onboarding.js` も更新する。
- `CHANGELOG.md` は旧履歴であり、現行 release note として更新しない。
- VS Code 拡張の version は `packages/vscode-extension/package.json` で独立管理する。

### 1.2 依存関係と品質ゲート

```bash
npm ci
npm ci --prefix packages/vscode-extension
npm run quality:full
```

`quality:full` は次を直列に検証する。

1. version 整合性
2. ESLint
3. Vitest unit tests
4. Electron desktop build
5. Capacitor mobile web build
6. VS Code extension build
7. Electron full E2E

packaging に影響する変更では、対象 OS で unpacked package も確認する。

```bash
npm run dist:dir
```

### 1.3 署名・notarization secret

公式 tag workflow には次の GitHub Actions Secrets がすべて必要である。

| Platform | Secret |
| --- | --- |
| Windows | `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD` |
| macOS signing | `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD` |
| macOS notarization | `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |

- certificate、password、Apple credential を repository、artifact、log に保存しない。
- workflow は `forceCodeSigning=true` を指定し、署名 identity を取得できない build を失敗させる。
- macOS workflow は `mac.notarize=true` を指定し、notarization と stapling が完了しない artifact を publish しない。
- secret の存在 check は値を出力せず、欠落した secret 名だけを error として報告する。

参考: [electron-builder Code Signing](https://www.electron.build/docs/features/code-signing/)、[macOS Notarization](https://www.electron.build/docs/notarization/)。

## 2. Platform manual smoke

自動テスト完了後、変更対象 platform で次を確認する。対象外項目は release evidence に理由を記載する。

### 2.1 共通

- [ ] clean user data で起動し、welcome／onboarding が操作できる。
- [ ] `.md` を app 内と OS の「Open with」の両方から開ける。
- [ ] 新規文書、既存文書、`.txt` を編集・保存・再読込できる。
- [ ] tab／split／workspace tree／search／settings の基本操作ができる。
- [ ] Markdown、HTML、PDF の対象 export が成功する。
- [ ] 再起動後に session、untitled dirty tab、theme が期待どおり復元される。
- [ ] 外部 link は既定 browser で開き、不正 scheme は拒否される。
- [ ] app 終了時の unsaved confirmation が機能する。

### 2.2 Windows

- [ ] installer／uninstaller が成功し、uninstall 後も user document が保持される。
- [ ] custom title bar の minimize／maximize／restore／close が機能する。
- [ ] file association と Explorer の open action が機能する。
- [ ] SmartScreen／署名状態が release 方針と一致する。

### 2.3 macOS

- [ ] `.dmg` と `.zip` の両方から起動できる。
- [ ] traffic lights、menu、Cmd shortcut、Finder open が機能する。
- [ ] Gatekeeper、署名、notarization の状態が release 方針と一致する。
- [ ] arm64／x64 の対象 architecture で成果物が生成されている。

## 3. GitHub Actions の gate

- Pull Request: `Fast quality gate` → `Electron smoke E2E`
- main push／nightly: `Fast quality gate` → `Electron full E2E`
- version tag: `Signing and notarization readiness` → `Fast quality gate` → `Electron full E2E` → signed Windows／signed and notarized macOS package and publish

tag release は前段 job が失敗または cancel された場合、package／publish を開始しない。

## 4. 公開

1. `v1.5.0` の形式で version tag を作成し push する。
2. GitHub Actions の全 gate と Windows／macOS package job の成功を確認する。
3. GitHub draft release の asset、version、release note を確認する。
4. platform manual smoke の evidence を release に記録する。
5. draft を publish する。
6. 必要な場合のみ、別 workflow で作成した mobile artifact を追加する。

## 5. Rollback

- 公開前の問題: draft release を公開せず、修正 version で再度 tag を作る。
- 公開後の重大問題: 対象 release を latest から外し、既知の安全な release を案内する。既存 tag／asset は証跡として削除しない。
- data format／settings migration を含む release は、機能資料に rollback 手順と旧 version 互換性を記載する。

## 6. Product metadata

- Repository: `https://github.com/cycyeasy1-svg/EasyMarkdown`
- Update API: `https://api.github.com/repos/cycyeasy1-svg/EasyMarkdown/releases/latest`
- App ID: `com.easymarkdown.app`
- License: MIT。`NOTICE.md` と `LICENSE` に `BND-1/horseMD` の attribution を保持する。
