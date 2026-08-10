---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-ARCHITECTURE-IMPORT-BOUNDARY
title: Architecture import boundary enforcement
risk: L
status: verified
owner: maintainers
platforms: shared, desktop-windows, desktop-macos, mobile-ios, mobile-android
last_verified: 2026-08-09
adr: docs/adr/0005-enforced-import-boundaries.md
security_review: docs/security-threat-model.md
---

# Architecture import boundary enforcement

## Context

EasyMarkdown の source は Electron main、sandboxed preload、browser renderer、shared pure logic、Capacitor adapter に分かれるが、import direction は build と人手 review だけに依存していた。`App.jsx` から `src/main/helpers.js` への直接 import が存在し、pure helper の現在実装は動作しても、将来 main 側に Node.js dependency が追加された場合に renderer boundary を破る構造であった。

本変更は全 Desktop／Mobile source の architecture と Electron trust boundary に影響するため L level とする。詳細 contract は [Architecture](../../architecture.md#import-boundary-contract)、判断理由は [ADR-0005](../../adr/0005-enforced-import-boundaries.md) を source of truth とする。

## Goal

- Main／preload／renderer／shared／platform adapter の許可 dependency direction を自動検査する。
- Electron／Node.js／Capacitor package を runtime owner 以外から import できないようにする。
- Platform adapter の public entry を一つに限定し、renderer と実装詳細を分離する。
- Current import graph を waiver なしで適合させ、`quality:fast` で regression を block する。

## Non-goal

- `App.jsx`、`src/main/index.js`、global CSS の大規模責務分割は行わない。
- Main 内部／renderer 内部の feature-level cycle、bundle size、unused export は検査しない。
- VS Code extension、website、Android／iOS native source の独立 toolchain を統合しない。
- Repository 全体を TypeScript 化しない。

## UX

Application UI と user flow の変更はない。Contributor は違反時に file、line、import specifier、禁止理由を CLI／CI log で確認し、`npm run architecture:check` で同じ結果を再現できる。

## Data

変更なし。Session、settings、document、local history、diagnostics、userData の migration は発生しない。

## Contract

`scripts/check-architecture-boundaries.mjs` が managed `src/` graph を AST 解析する。Layer direction、runtime dependency owner、platform public entry、literal dynamic dependency を検査し、error が一件でもあれば non-zero exit とする。Policy は [Quality Gate 運用規約](../../quality-gates.md#architecture-import-policy) に従う。

## Migration

`slugifyMarkdownAnchor`、`extractMarkdownLinks`、`attachmentLinkMarkdown` を `src/main/helpers.js` から `src/shared/markdown.js` へ移す。Renderer と Main の direct caller は shared module を参照し、`src/main/helpers.js` は既存 import compatibility のため re-export する。Function signature と output は変更しない。

## Acceptance Criteria

### AC-ARCH-001 — Managed source の import edge を deterministic に抽出する

JavaScript／JSX の static import、re-export、literal `import()`、`require()` を file／line 付きで抽出し、comment／string／JSX を誤検出しない。Non-literal dynamic dependency と未対応 TypeScript source は fail-closed にする。

### AC-ARCH-002 — Repository layer direction を強制する

Main／preload／renderer／shared／platform の許可 target だけを受け入れ、禁止 layer または managed root 外への relative import を non-zero error にする。

### AC-ARCH-003 — Runtime dependency owner を強制する

Electron は main／preload、Node.js builtin は main、Capacitor package は platform adapter だけに許可する。Shared は external package を持たず、preload／platform の external dependency は allowlist 外を拒否する。

### AC-ARCH-004 — Platform adapter の実装詳細を隠蔽する

Renderer は `src/renderer/src/platform/index.js` だけを import でき、`capacitor-api.js` への direct／deep import を拒否する。Platform adapter から renderer feature への逆依存も拒否する。

### AC-ARCH-005 — Existing cross-layer edge を shared contract へ移行する

Renderer は main helper を import せず、Markdown helper の既存 signature／behavior を shared source of truth から利用する。Main compatibility re-export と characterization test は維持する。

### AC-ARCH-006 — Fast quality gate に統合する

`npm run architecture:check` が current repository を waiver なしで成功し、`quality:fast`、Contributor guide、AGENTS、architecture／quality document から同じ contract を参照できる。

### AC-ARCH-007 — Runtime regression を発生させない

Desktop／Mobile／VS Code build、既存 unit gate、Electron smoke が成功し、UI、IPC、file format、persisted data behavior に変更がない。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Feature flag は不要であり、Pull Request CI から即時適用する。初回 CI 成功後に P3-2 を `DONE` とし、以後の layer／runtime dependency 変更は同じ checker と L level review 条件に従う。

## Rollback

False positive で開発を停止する場合は、最小再現 unit test とともに checker を修正する。Runtime 回帰時は shared helper extraction と caller import を同時に revert でき、user data rollback は不要である。Violation ignore／baseline の追加だけで gate を通さない。

## Open Questions

- なし。TypeScript source の導入時は parser coverage を同じ change で追加することを既定 contract とする。
