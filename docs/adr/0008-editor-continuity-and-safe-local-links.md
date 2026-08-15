---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-15
---

# ADR-0008: Markdown offset と main-side link resolution を共通境界とする

- Status: Accepted
- Date: 2026-08-15
- Owners: maintainers
- Feature: `FD-EDITOR-CONTINUITY`

## Context

EasyMarkdown は Keep、Milkdown、source の異なる editor representation を持ち、Desktop、VS Code、HTML LITE では利用可能な filesystem capability も異なる。DOM position や renderer-resolved path をそのまま共通 contract にすると、editor 切替で position が無効になり、renderer compromise 時には arbitrary local file を OS shell へ渡せる。

一方、各 editor／platform に個別 implementation を置くだけでは、restart position と local link の表現差が増え、Windows drive、UNC、`file:` URL、fragment の扱いが不一致になる。

## Decision Drivers

- Keep／Milkdown／source 間で利用でき、document content 変更時に安全に破棄できる position 表現。
- Document 本文や selection text を永続化しない privacy boundary。
- Renderer が侵害されても、untrusted href から executable を起動しない main-side authority。
- VS Code と HTML LITE の capability 差を維持する。
- 既存 session／document format を変更せず rollback できる。

## Considered Options

1. Editor ごとの DOM path、selection object、scrollTop だけを永続化する。
2. Document source の Markdown offset と content fingerprint を永続化し、各 editor adapter が変換する。
3. Renderer が local path を解決して `shell.openPath` へ absolute path を送る。
4. Main process が untrusted href と trusted absolute base path から target を再解決し、type policy を適用する。

## Decision

Position は Option 2、Desktop local open は Option 4 を採用する。

- Position record は caret／viewport の Markdown offset、content fingerprint、updated time だけを bounded local store に保存する。
- 各 editor API は current selection／viewport を Markdown offset へ変換し、復元時も editor 自身の mapping を使用する。
- Fingerprint 不一致では position を復元しない。Exact visual pixel の再現より content safety を優先する。
- Markdown link は renderer の tab navigation に留め、non-Markdown link だけを目的限定 preload API へ渡す。
- Main process は href、absolute base document path、target stat、dangerous extension を検証し、safe regular file だけを `shell.openPath` へ渡す。
- VS Code は extension host の `vscode.open` を authority とし、HTML LITE は browser workspace capability 外を拒否する。

## Consequences

### Positive

- Editor mode を越えて position を best-effort に復元でき、content 変更時の stale restore を避けられる。
- Renderer-only validation に依存せず、OS shell boundary を fail-closed にできる。
- Platform ごとの capability を同一 UX に見せかけず、Desktop／VS Code／HTML LITE の責務を明確にできる。

### Negative

- Markdown offset mapping は完全な pixel position を保証せず、大幅な reformat 後は復元を省略する。
- Main と renderer の両方に link classification が必要で、policy parity test の保守が増える。
- UNC target の実在確認は network latency の影響を受けるため、open action 時だけ実行する必要がある。

## Migration and Rollback

Position store は新規 versioned key とし、既存 data migration は行わない。IPC は additive で、rollback 時は API と handler を除去して position key を無視する。Document、workspace、session の format は変更しない。

## Validation

- Position schema、fingerprint、LRU と path resolver／dangerous extension の unit test。
- Built Electron で editor edit、dirty、restart position、local link の E2E。
- VS Code resolver unit test、extension build、HTML LITE containment regression。
- `architecture:check`、API shape、Feature Dossier／Docs as Code gate。

## References

- [Feature Dossier](../feature-dossiers/editor-continuity/feature.md)
- [Test Specification](../feature-dossiers/editor-continuity/test-spec.md)
- [Security Threat Model](../security-threat-model.md)
