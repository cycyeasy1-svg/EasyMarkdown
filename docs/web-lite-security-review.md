---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-10
---

# Web Lite Security Review

## 1. Scope

対象は `packages/web-lite/` と `dist-web-lite/` の local static browser application、File System Access API、drag／drop、download fallback、shared Keep renderer である。Desktop Electron の IPC contract は [既存 threat model](./security-threat-model.md) の対象であり、本 review では変更しない。

## 2. Trust Boundary

Untrusted input は利用者が選択した Markdown／embedded HTML／relative image／document link である。Privileged resource は browser が permission を付与した file／directory handle である。Web Lite は Node、Electron preload、shell command、registry、default application registration、backend API を持たない。

## 3. Security Contract

- Open／tree scan 対象は `.md`、`.markdown`、`.mdx` に限定する。
- Workspace relative path は separator を正規化し、absolute path、NUL、`..` traversal、workspace root 外参照を拒否する。
- File／folder access は user gesture と browser permission に従い、remembered handle の再利用時も permission を確認する。
- Markdown raw HTML は shared Keep sanitizer を通し、document 由来 script／event handler／unsafe URL を実行しない。
- External URL は `https:`、`http:`、`mailto:` だけを new browser context で開き、opener を渡さない。
- Build asset は directory 内に自己完結し、CDN／runtime fetch を必要としない。CSP は `connect-src`、`frame-src`、`object-src` を禁止する。
- Relative image は selected workspace 内の handle から Blob URL として解決し、tab／workspace cleanup で URL を revoke する。
- Direct save は既存 file handle または explicit save picker に限定し、失敗時は document download へ fallback する。
- BOM と EOL を保持し、attachment の生成、実行可能 file の open／write、任意 directory の recursive write を行わない。

## 4. Threat Review

| Threat | Impact | Mitigation | Residual risk |
| --- | --- | --- | --- |
| Malicious Markdown／HTML | Browser XSS、local document access | Shared sanitizer、CSP、no Node／IPC | Browser／sanitizer の未修正脆弱性 |
| Path traversal in image／link | Workspace 外 file read | Normalized relative path と root containment | Symlink semantics は browser implementation に依存 |
| Over-broad folder permission | Confidential file exposure | User-selected handle、extension filter、permission re-check | 利用者が広い root を明示選択する可能性 |
| Accidental overwrite | Document loss | Explicit handle、dirty prompt、BOM／EOL preservation、download fallback | Browser crash と同時書き込み競合は完全には防げない |
| Remote tracking／data exfiltration | Document／usage privacy loss | Local assets、network-deny CSP、no telemetry／backend | External link を利用者が明示的に開くと browser navigation が発生 |
| Stale static directory | Known vulnerability の継続利用 | Version display、checksum／directory replacement を promotion gate にする | Experimental 期間は automatic update を提供しない |

## 5. Privacy

Document content は memory と user-selected file にのみ存在し、telemetry、analytics、backend upload を行わない。IndexedDB は recent folder handle、localStorage は language／theme／typography preference だけを保持する。Local Font Access は利用者が「本機 font を取得」を実行した場合だけ browser permission を要求し、取得した family name は session memory の option 表示にだけ利用して永続化しない。Browser 自体の enterprise telemetry／download policy は本 application の control 外である。

## 6. Verification and Review Trigger

- `test/web-lite-files.test.js` で extension、path traversal、BOM／EOL contract を検証する。
- `scripts/test-web-lite.mjs` で built static app の Keep render と source transaction を検証する。
- Shared sanitizer／Keep／Mermaid の regression suite と `quality:fast` を継続する。
- Open extension、external scheme、CSP、storage、permission、file write、network dependency を変更する場合は本 review を更新する。
