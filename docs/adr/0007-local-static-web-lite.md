---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-10
---

# ADR-0007: Shared Keep core を serverless browser shell から利用する

- Status: Accepted
- Date: 2026-08-10
- Owners: maintainers
- Feature: `FD-WEB-LITE`

## Context

社内利用では unsigned Electron executable の reputation／antivirus 誤検知を避けたい一方、server の構築・運用を先行させることもできない。旧 Markdown 閲覧 tool は static HTML で local file を扱えたが、parser、sanitizer、UI を現行 product と別実装で維持すると security と機能差が拡大する。

## Decision Drivers

- Backend、installer、native command を持たず local static directory だけで起動できる。
- Desktop／Mobile／VS Code と同じ Keep parser、format、sanitizer、table、Mermaid behavior を利用する。
- Browser permission boundary 外の file を読み書きしない。
- Existing product entry point と native API contract を変更しない。
- Managed browser policy で direct write が禁止された場合も read／download fallback を提供する。

## Considered Options

1. 旧 static tool を独立 codebase として更新する。
2. Desktop renderer 全体を static build に流用し、native API を多数 stub する。
3. Shared Keep core を直接 import する専用 browser shell と file adapter を同一 repository に追加する。
4. Internal Web server と backend file API を先に構築する。

## Decision

Option 3 を採用する。

- `packages/web-lite/` を独立 entry point とし、`dist-web-lite/` に classic IIFE、CSS、local assets を生成する。
- Keep の parser／sanitizer／editing implementation は `src/renderer/src/` を直接参照し、Web Lite へ複製しない。
- Native IPC の代わりに File System Access API、drag／drop、download fallback だけを browser adapter として実装する。
- Folder handle は利用者が選択した場合だけ IndexedDB に保持し、再利用時も browser permission を再確認する。
- Open 対象は `.md`、`.markdown`、`.mdx` に限定し、relative path は workspace root containment を検証する。
- Network dependency を持たず、CSP で connect／frame／object を禁止する。

## Consequences

### Positive

- Executable や code signing を必要とせず、static directory の置換だけで社内評価できる。
- Keep の bug fix と sanitizer update が次回 build で Web Lite にも反映される。
- Desktop／VS Code の package、preload、IPC、extension entry point を変更しない。
- Document は browser から server へ送信されない。

### Negative

- File System Access API と `file://` secure-context behavior は Chromium browser に依存する。
- File watcher、Explorer integration、既定 application、native menu、automatic update は提供できない。
- Folder permission は browser／enterprise policy により失効または禁止される。
- Shared Keep UI の bundle は lightweight shell に対して大きく、初回 parse cost は native build と同等に残る。

## Migration and Rollback

既存 Desktop／Mobile／VS Code data の migration はない。Web Lite は独立 build output であり、導入は static directory の配布だけで行う。Rollback は当該 directory を削除するか前回 checksum の archive へ差し替える。User document format、desktop session、VS Code settings は変更しない。IndexedDB の remembered handle が残っても、browser permission なしに file content を取得できない。

## Validation

- Browser file adapter の unit test と Keep parser／round-trip regression。
- `file://` からの Edge smoke で open、Keep render、table、source transaction、console error を確認。
- `quality:fast` で Desktop、Mobile、Web Lite、VS Code build と shared quality gate を確認。
- Product Support Matrix と security review の static document gate。

## References

- [Feature Dossier](../feature-dossiers/web-lite/feature.md)
- [Test Specification](../feature-dossiers/web-lite/test-spec.md)
- [Web Lite security review](../web-lite-security-review.md)
- [Product Support Matrix](../product-support-matrix.md)
