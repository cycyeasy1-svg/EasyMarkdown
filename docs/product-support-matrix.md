---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-10
---

# Product Support Matrix

## 1. 目的

本書は、EasyMarkdown の各 product／platform に対する現在の support promise、official publication 可否、release gate、昇格条件を定義する source of truth である。機能数、version 番号、build 成功だけでは Stable と判断しない。

2026-08-09 時点で [GitHub Releases](https://github.com/cycyeasy1-svg/EasyMarkdown/releases) に公開済み release は存在しない。そのため README／Website の download link、local package、versioned changelog は official distribution evidence とみなさない。

Tier と publication readiness は別概念とする。

- **Tier**: 当該 product の互換性と support に対する現在の promise。
- **Readiness**: 今この commit から official artifact を公開してよいかという release 単位の判定。

## 2. Tier contract

| Tier | Build | Automated test | Manual smoke | Signing／distribution | Rollback／support |
| --- | --- | --- | --- | --- | --- |
| Stable | 対象 platform の再現可能な production package。version／artifact が source commit と一致 | 共通 quality gate、対象 product の integration／E2E、release blocking regression がすべて成功 | 対象 OS／device の install、主要操作、upgrade、uninstall／restore を release ごとに実施 | Native／Store／Marketplace の要求に従い署名し、checksum／provenance と release note を付与 | 既知の安全な previous release、data compatibility、withdraw／hotfix 手順を evidence として保持。Supported baseline の bug を継続 triage |
| Beta | Deterministic build と配布候補 artifact を生成可能 | 共通 lint／unit／build と主要 contract test が成功。未自動化範囲を明記 | 外部配布前に代表 OS／device で core flow と data preservation を確認 | 配布 channel が署名を要求する場合は署名必須。Known limitation を release note に記載 | Artifact を withdraw し previous beta または source build へ戻せる。互換性保証は Stable より狭い |
| Experimental | Build または prototype 起動を best effort で確認 | 利用可能な static／unit／shared build のみ。専用 E2E は必須ではない | Maintainer が必要時に実施し、未検証範囲を明示 | Official distribution を promise しない。Secret や unsigned artifact を official と表示しない | 予告なく変更／廃止できる。Migration guarantee／support SLA は持たない |

Readiness は次の値を使用する。

- `READY`: 当該 release の必須 evidence が揃い、公開可能。
- `BLOCKED`: Tier は宣言済みだが、今回の official publication に必要な evidence が不足。
- `NOT ELIGIBLE`: Experimental のため official release 対象外。

## 3. Current matrix

| Product | Compatibility baseline | Tier | Readiness | Current evidence | Owner |
| --- | --- | --- | --- | --- | --- |
| Desktop Windows | Windows 10／11 x64 | Beta | `BLOCKED` | Electron build、unit、Linux Electron E2E、Windows NSIS／zip config、signed tag workflow | maintainers |
| Desktop macOS | macOS 12+、x64／arm64（Electron 43 系） | Beta | `BLOCKED` | Cross-platform renderer、macOS package config、signed／notarized tag workflow | maintainers |
| Mobile Android | Build floor API 24、実機 evidence は Android 10／12 | Beta | `BLOCKED` | Capacitor web build、native project、local signed APK 手順、2 device の過去 smoke | maintainers |
| Mobile iOS | iOS 15+ build configuration | Experimental | `NOT ELIGIBLE` | Capacitor web build、Xcode project。TestFlight／device evidence なし | maintainers |
| VS Code extension | VS Code 1.84+ | Beta | `BLOCKED` | Independent v1.6.0、extension build、shared／extension characterization tests、changelog | maintainers |
| Website | Browser baseline 未確定 | Experimental | `NOT ELIGIBLE` | Static source、GitHub Pages canonical URL、Vercel header config。Deploy／link／browser smoke gate なし | maintainers |
| Web Lite（local static） | Microsoft Edge／Google Chrome 120+、File System Access API | Experimental | `NOT ELIGIBLE` | `file://` IIFE build、shared Keep core、unit test、local Edge smoke。Server／installer なし | maintainers |

Electron 43 は current dependency である。Electron 44 以降は macOS 13+ を要求するため、Electron major update は L level change とし、本 matrix と manual smoke baseline を同時に更新する。参考: [Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes/)。

## 4. Product-specific release gate

### 4.1 Desktop Windows — Beta

Official publication を `READY` にするには、次を一つの release evidence に記録する。

- `quality:full` と Windows package job が source commit に対して成功。
- Authenticode 署名済み NSIS／zip の生成と署名検証。
- Clean install、launch、save、file association、Open with、upgrade、uninstall 後の user document 保持。
- Windows 10／11 の少なくとも一方で manual smoke。Stable 昇格時は双方を対象とする。
- SHA-256 checksum／provenance、release note、previous version への rollback 案内。

Stable 昇格条件は、署名済み official release を少なくとも一度公開し、install／upgrade／rollback evidence と重大な data loss／startup blocker がないこととする。

### 4.2 Desktop macOS — Beta

Official publication を `READY` にするには、次を満たす。

- `quality:full` と macOS package job が source commit に対して成功。
- Developer ID 署名、notarization、stapling を `.dmg`／`.zip` の双方で検証。
- arm64／x64 artifact、Gatekeeper launch、Finder open、traffic lights、Cmd shortcut、upgrade を native macOS で smoke。
- Previous artifact へ戻す手順と、settings／document compatibility を記録。

Stable 昇格には x64／arm64 の署名済み official release と、対象 macOS baseline の install／upgrade evidence が必要である。

### 4.3 Mobile Android — Beta

Official publication を `READY` にするには、次を満たす。

- `npm run build:mobile`、`cap sync android`、Gradle `bundleRelease` または signed APK build を同一 version で実施。
- Keystore は repository 外で管理し、signature／applicationId／versionCode／versionName を検証。
- Android 10／12 代表 device で open、edit、save、share、background／resume、permission、soft keyboard、upgrade を確認。
- App-private document の backup／export と downgrade 非互換時の案内を release note に記載。
- GitHub Release または Google Play の配布 channel と撤回手順を決定。

Stable は native build CI、複数 API level の regression、signed update／rollback evidence が整うまで宣言しない。

### 4.4 Mobile iOS — Experimental

Beta 昇格には次が必要である。

- macOS runner または controlled Mac で Xcode archive を再現。
- Apple Developer signing、provisioning、TestFlight upload を完了。
- iOS 15+ の simulator と少なくとも一台の実機で document picker、edit／save／share、safe area、soft keyboard、background／resume、upgrade を確認。
- TestFlight rollback／build expiration／user document export の support 手順を作成。

これらが揃うまでは download／App Store availability を案内しない。

### 4.5 VS Code extension — Beta

Official publication を `READY` にするには、次を満たす。

- Extension independent version、CHANGELOG、Chinese release note が一致。
- Production build と `.vsix` package を作成し、VS Code 1.84 と current stable の双方へ install smoke。
- Keep open／edit／save、source switch、workspace link、webview restore、upgrade／Reload Window を確認。
- Marketplace publisher credential を repository 外で管理し、publish 後の version／publisher／artifact を検証。
- Previous extension version の install または hotfix publish を rollback として rehearsal。

Stable 昇格には Marketplace publication evidence、VSIX install／upgrade smoke、minimum VS Code baseline の継続検証が必要である。

### 4.6 Website — Experimental

Beta 昇格には次が必要である。

- Official hosting source と deploy owner を一つに決定し、preview／production deploy を再現可能にする。
- Internal link、download link、canonical／sitemap／robots、404、mobile／desktop viewport を自動または manual smoke。
- Public download 表示を Product Matrix の readiness と一致させ、artifact がない状態で download 可能と表示しない。
- Previous deployment へ rollback できる version／commit link を保持。

Stable は availability owner、deployment evidence、broken-link／accessibility gate を定義した後に検討する。

### 4.7 Web Lite（local static）— Experimental

Web Lite は社内評価向けの serverless prototype とする。`dist-web-lite/` を local disk または read-only share へ配置し、Edge／Chrome で `index.html` を直接開く。Executable、installer、既定 application 登録、native update、background service は提供しない。

Beta 昇格には次が必要である。

- Managed Edge／Chrome の実際の enterprise policy で folder open、permission renewal、direct save、download fallback を smoke する。
- `file://` 配置および社内 HTTP 配置の browser baseline、配布 owner、更新／撤回手順を確定する。
- Static archive の checksum／source commit を追跡し、古い directory へ戻す rollback を rehearsal する。
- Keep edit、table、Mermaid、KaTeX、relative image、internal link、BOM／EOL preservation を代表文書で確認する。
- Content Security Policy と network-free asset contract を継続検証し、document content を外部送信しないことを security review する。

Experimental の間は local build を official release と表示せず、browser policy による File System Access API 無効化を support failure とみなさない。

## 5. Release evidence と authorization

Beta／Stable product を外部公開する前に、[release evidence template](./release-evidence/_template.md) を複製して `docs/release-evidence/<release-id>.md` を作成する。最低限、次を記録する。

- Source commit、version、対象 product／tier、artifact と checksum
- Automated run URL／result
- Manual smoke の OS／device／installer／upgrade result
- Signing／notarization／Store／Marketplace verification
- Migration／compatibility／known limitation
- Rollback target、rehearsal、publication decision、owner

Secret、certificate、password、token、user document は evidence に記録せず、存在と検証結果だけを残す。必須項目が一つでも不足する場合、readiness は `BLOCKED` のままとし、official tag／publish を行わない。

## 6. Demotion と support policy

次の場合は publication を停止し、必要に応じて tier を一段階下げる。

- Document loss、save corruption、起動不能、security／privacy boundary 違反。
- Required CI／signature／notarization／Store verification の失敗または credential 失効。
- Supported runtime／OS が upstream EOL となり、security update を提供できない。
- Rollback target が存在しない、または upgrade で data compatibility を失う。

Public issue は全 tier で受け付けるが、response SLA は設定しない。Stable は declared baseline の regression を優先 triage し、Beta は known limitation を許容する。Experimental は best effort とし、migration guarantee を持たない。

## 7. 現在の優先順位

1. Desktop Windows の署名済み初回 release evidence を作り、Stable 昇格を判断する。
2. Desktop macOS の signed／notarized x64／arm64 package と native smoke を確立する。
3. VS Code の VSIX／Marketplace install・upgrade workflow を確立する。
4. Android native build／signature／device matrix を CI または再現可能な controlled release 手順へ移す。
5. iOS TestFlight evidence と Website deploy gate は、distribution owner を決めてから Beta 化する。
6. Web Lite は社内 pilot で managed browser policy と static directory 更新手順を確認した後に Beta 化を判断する。
