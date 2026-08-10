---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# 型・契約・回帰 Quality Gate 運用規約

## 1. 目的

本規約は、EasyMarkdown の変更を「build できた」だけで完了とせず、platform 境界、翻訳、回帰、accessibility、dependency risk を Pull Request の同じ feedback loop で検出するための source of truth である。既存 JavaScript を一括 TypeScript 化せず、破損時の影響が大きい境界から段階的に保護する。

## 2. Gate 一覧

| Gate | Command | Scope | Fail condition |
| --- | --- | --- | --- |
| API contract | `npm run api:check` | Desktop preload、Capacitor shim、17 capability | 必須 method／flag の欠落、`true` capability の実装欠落、runtime assertion 欠落 |
| Boundary type | `npm run type:check` | API、session、settings、i18n contract 等の選定済み JavaScript | `checkJs` type error |
| i18n parity | `npm run i18n:check` | `en` を基準とする全 locale | key の欠落／余剰、placeholder 不一致、非 string value |
| Coverage | `npm run coverage:check` | unit-test 可能な main／shared／renderer pure logic | statements 73%、branches 76%、functions 74%、lines 73% のいずれかを下回る |
| Accessibility smoke | Electron smoke E2E | startup app chrome | axe の `serious`／`critical` violation |
| Dependency audit | `npm run dependencies:check` | root と VS Code extension の lockfile | severity 別件数が committed baseline より増加、audit 実行不能、baseline 不整合 |

`npm run quality:fast` は network 非依存の API、type、i18n、coverage gate を既存 document／lint／build gate と直列実行する。Dependency audit は registry availability に依存するため GitHub Actions と release workflow の独立 job とし、後続 E2E／publish を fail-closed で block する。

## 3. Boundary-first type policy

型導入は「全面移行」ではなく、次の優先順位で行う。

1. Desktop／Mobile 間の API と capability。
2. Session、settings、file format、IPC payload 等の永続／privileged boundary。
3. 新規に抽出した dependency-free module。
4. 回帰 risk が高く、pure test と組み合わせられる既存 module。

現時点の対象は `src/shared/api-contract.js`、`src/shared/i18n-contract.js`、`src/renderer/src/session.js`、`src/renderer/src/settings.js`、`src/renderer/src/fonts.js` である。対象追加は `tsconfig.contracts.json` の `include` へ明示し、error を `any` や除外で隠さない。既存巨大 component の一括変換は本 gate の責務外とする。

## 4. Platform API contract

`src/shared/api-contract.js` を renderer-visible API の source of truth とする。

- 全 platform は `platform`、`safeMode`、`capabilities` と core method を提供する。
- 17 capability は全 key を boolean で宣言する。未対応機能は key／method の欠落で表現せず、`false` を明示する。
- Capability を `true` にする場合、その capability に紐づく method をすべて実装する。
- Desktop preload と Capacitor shim は公開直前に runtime assertion を通す。
- 新しい `window.api` method／capability を追加する変更は、contract、両 platform profile、static／unit test、必要な Feature Dossier を同じ PR で更新する。

Static checker は object literal の公開 shape と runtime assertion の存在を検査し、unit test は capability と method の意味的な対応を検査する。どちらか一方だけを conformance evidence としない。

## 5. i18n parity

English locale を canonical key set とする。すべての locale は同じ key を持ち、`{name}` のような interpolation placeholder の集合も一致させる。翻訳品質や自然さは review の責務であり、checker は key drift と runtime interpolation failure だけを判定する。

## 6. Coverage no-regression

Coverage threshold は導入時の実測値より少し低い固定 floor とし、偶然の小さな変動で不安定にならず、意図しない大幅低下を検出する。Threshold を上げる変更は推奨する。下げる場合は、対象外にする技術的理由、代替 test evidence、復帰条件を Feature Dossier または PR に記載し、無根拠に数字だけを変更しない。

Coverage は pure／deterministic logic の保護指標であり、Electron lifecycle、ProseMirror、OS integration の正しさを代替しない。それらは smoke／full E2E と product-specific manual evidence で確認する。

## 7. Accessibility smoke

Startup smoke は `.activity-bar`、`.topbar`、`.pane-left`、`.statusbar` の app chrome を axe で検査し、rule を無効化せず `serious`／`critical` violation を失敗させる。CSS transition が完了してから検査し、animation 中間色による false positive を避ける。

Milkdown／user document 領域は第三者 editor semantics と document content の影響を分離して評価する必要があるため、現在の app-chrome gate には含めない。これは免除ではなく残存 scope であり、editor accessibility は専用改善 item と実 browser／assistive technology evidence で段階導入する。

## 8. Dependency audit baseline

Committed baseline は `config/dependency-audit-baseline.json` とする。2026-08-09 時点の件数は次のとおりである。

| Project | Info | Low | Moderate | High | Critical | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 0 | 0 | 2 | 17 | 1 | 20 |
| VS Code extension | 0 | 0 | 3 | 0 | 0 | 3 |

この baseline は既知 vulnerability の修正済み判定、risk acceptance、release authorization ではない。新規増加を止めるための no-regression floor である。既存 critical／high debt は dependency chain、runtime reachability、互換性を確認して別 batch で削減する。`npm audit fix --force` は major upgrade と product regression を伴い得るため、Feature Dossier、build／E2E evidence、rollback なしに実行しない。

Baseline の変更時は audit JSON、変更理由、増減した advisory、owner、対応期限を PR に記録する。単に gate を通す目的で件数を増やさない。

## 9. Change workflow

1. 変更が API、session、settings、i18n、dependency、app chrome に触れるか確認する。
2. 対応する contract／test／document を同じ branch で更新する。
3. `npm run quality:fast`、UI／Electron 変更時は `npm run test:e2e:smoke:built` を実行する。
4. Dependency 変更時は `npm run dependencies:check` を実行し、baseline 差分を review する。
5. 初回 GitHub Actions の fast／dependency／smoke gate を確認してから roadmap item を `DONE` にする。

## 10. Rollback

Gate の誤検出で開発が停止した場合も、contract や baseline を無条件に削除しない。最小の再現 test を追加して checker を修正する。一時解除が必要な場合は issue／PR に owner、理由、影響範囲、復帰条件、期限を残す。Runtime API contract の rollback は Desktop／Mobile profile と renderer 利用箇所を同時に戻し、片側だけを旧 shape にしない。
