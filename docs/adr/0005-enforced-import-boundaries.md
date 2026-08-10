---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# ADR-0005: Runtime owner を明示する import boundary を自動強制する

- Status: Accepted
- Date: 2026-08-09
- Owners: maintainers
- Feature: `FD-ARCHITECTURE-IMPORT-BOUNDARY`

## Context

EasyMarkdown は Electron main、sandboxed preload、browser renderer、shared pure logic、Capacitor adapter を一つの repository で管理する。Build が成功しても、renderer が main module を直接 import する、shared module が runtime package に依存する、browser code が Electron／Node.js／Capacitor を取り込む等の architecture drift は検出できない。

実際に `App.jsx` は Markdown link helper を `src/main/helpers.js` から直接 import していた。対象関数は pure で runtime API を使用していなかったが、main module の将来変更によって renderer bundle へ Node.js dependency が混入し得る direction であった。Review だけで全 import graph を継続確認することは、module 数の増加に対して再現性がない。

## Decision Drivers

- Electron の privilege boundary と sandbox 前提を source layout でも保護する。
- Desktop／Mobile 共通 logic と platform 固有 dependency の owner を明示する。
- Existing giant module を一括分割せず、current graph 全体を deterministic に検査する。
- Dynamic import、re-export、CommonJS require を含む迂回経路を同じ contract で扱う。
- Baseline／ignore を architecture debt の恒久 waiver にしない。
- Local／CI の fast feedback を network 非依存に保つ。

## Considered Options

1. Import direction を document と code review だけで確認する。
2. ESLint `no-restricted-imports` の path pattern だけで制限する。
3. General-purpose dependency graph tool と committed violation baseline を導入する。
4. Repository 固有の layer／runtime owner を AST checker で検証し、current violation を解消して zero-waiver gate にする。

## Decision

Option 4 を採用する。

- `main` は `main`／`shared`、`preload` は `preload`／`shared`、`renderer` は `renderer`／`shared`、`platform` は `platform`／`shared`、`shared` は `shared` だけを repository 内で import できる。
- Renderer から platform adapter への唯一の public entry を `src/renderer/src/platform/index.js` とする。
- Electron package は main／preload、Node.js builtin は main、Capacitor package は platform adapter だけが import できる。Shared は external dependency を持たない。
- `scripts/check-architecture-boundaries.mjs` は Espree で JavaScript／JSX の static import、re-export、literal `import()`、`require()` を解析する。Non-literal dynamic dependency と管理 layer 外への local import は fail-closed とする。
- TypeScript source が `src/` に追加された場合、parser coverage を同じ change で追加するまで checker を失敗させ、未検査 file を黙って受け入れない。
- 既存 renderer → main edge は Markdown helper を `src/shared/markdown.js` へ移して解消する。`src/main/helpers.js` は既存 caller のため compatibility re-export を維持する。
- `npm run architecture:check` を `quality:fast` に含め、Pull Request／main／release の同じ fast gate で実行する。

## Consequences

### Positive

- Browser code への privileged／server runtime dependency 混入を merge 前に検出できる。
- Shared logic と platform adapter の責務が directory と同じ方向になる。
- Current graph は waiver なしで検査され、新しい違反だけを baseline で隠す運用にならない。
- App／main giant module の責務分割を、保護された dependency direction の内側で段階実施できる。

### Negative

- 新しい layer、alias、source language、正当な external dependency には checker と contract の同時更新が必要になる。
- Repository 固有 checker の test／document maintenance が発生する。
- Import direction は global access、IPC semantics、runtime behavior の正しさを保証しないため、API contract／security review／E2E は引き続き必要である。
- Main 内部や renderer 内部の feature-level cycle は本 decision の検査対象外である。

## Migration and Rollback

Markdown anchor／link extraction／attachment link helper を shared module へ移し、Main 側は re-export で compatibility を維持する。Function signature、saved data、IPC、file format、UI behavior の migration はない。

Rollback は shared extraction、import 更新、checker、package script、document を同じ commit 単位で revert する。Checker の誤検出時は最小再現 test を追加して parser／rule を修正し、無期限 ignore や violation baseline へ戻さない。

## Validation

- Parser と layer matrix の unit test。
- Current repository すべての managed source に対する `npm run architecture:check`。
- Existing Markdown helper characterization test。
- `npm run quality:fast`、dependency no-regression、Desktop／Mobile／VS Code build。
- Runtime UI 変更がないことを確認する Electron smoke E2E。

## References

- [Feature Dossier](../feature-dossiers/architecture-import-boundary/feature.md)
- [Test Specification](../feature-dossiers/architecture-import-boundary/test-spec.md)
- [Architecture](../architecture.md#import-boundary-contract)
- [Quality Gate 運用規約](../quality-gates.md#architecture-import-policy)
- [Security Threat Model](../security-threat-model.md)
