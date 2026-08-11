---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-WEB-LITE
title: Serverless Web Lite
risk: L
status: verified
owner: maintainers
platforms: website, shared
last_verified: 2026-08-10
adr: docs/adr/0007-local-static-web-lite.md
security_review: docs/web-lite-security-review.md
---

# Serverless Web Lite

## Context

社内利用で unsigned executable の reputation／antivirus risk を避けながら Markdown を閲覧・編集したいが、server 運用を先行させることはできない。旧 Markdown 閲覧 tool の軽量な local interaction を参考にしつつ、parser と UI を別系統で保守せず、現行 EasyMarkdown の Keep core と product language を利用する必要がある。

## Goal

- Backend、installer、executable なしで local static directory から起動できる。
- Current Keep の安全な表示、限定編集、table、Mermaid、KaTeX、Undo／Redo と source navigation を共有する。
- Chromium browser の user-granted handle で folder tree、multi-tab、direct save、relative image／link を提供する。
- Current App と同じ本文幅、文字 size、zoom、line／paragraph／heading spacing と language 別 font contract を提供する。
- Current document の browser-visible path、save state、active table filter を status bar で常時確認できる。
- Existing Desktop、Mobile、VS Code build と runtime contract を変更しない。

## Non-goal

- Explorer integration、default application registration、recursive watcher、native menu、automatic update は実装しない。
- Server storage、multi-user collaboration、remote synchronization、telemetry は導入しない。
- Firefox／Safari や enterprise policy で File System Access API が無効な環境へ direct save を保証しない。
- Desktop の全機能 parity は目標としない。

## UX

EasyMarkdown／VS Code に近い title action、activity bar、file／outline sidebar、tab、status bar を持つ。Welcome から folder を primary action、single file を secondary actionとして選択できる。両 action は desktop で同一寸法の 2 column、narrow container で同一幅の vertical stack とし、hero title は wide container で不自然に分断しない。Narrow viewport の初回表示では sidebar を閉じ、welcome action を overlay で隠さない。Source button は同一 control で open／close を切り替え、Source panel open 中も preview scroll を維持する。Source scroll は visible source line を shared Keep offset へ mapping して preview を追従させ、apply 後に一 transaction として document へ戻す。Permission failure、external change、dirty close、read／save failure、download fallback を user-facing message で回復可能にする。Chinese／Japanese／English、keyboard shortcut、focus indicator、responsive layout、reduced motion を提供する。

Typography panel は document 本文だけを対象とし、application chrome を拡大しない。Frequently changed size／width／spacing は preset と fine tune を組み合わせ、font enumeration は explicit user action でのみ browser permission を要求する。Permission が得られない場合も system default と common font 候補を利用できる。

Status bar は primary area に current path、saved／unsaved state、active table filter count と clear action を置き、local mode、manual reload、language、version を auxiliary area に維持する。Browser API は absolute filesystem path を公開しないため、folder open では granted folder name と relative path、single-file open では file name を表示する。Narrow viewport では path を ellipsis にし、state と filter action を優先する。

## Data

- Document content は open tab の memory と user-selected file にのみ保持する。
- Recent folder handle は IndexedDB、theme／language は localStorage に保存する。
- Typography preference は Web Lite 専用 localStorage key に保存し、Desktop settings と共有しない。
- UTF-8 BOM と CRLF／LF を read 時に検出し、save 時に保持する。
- Server、telemetry、analytics へ document content を送信しない。

## Contract

- Output は `dist-web-lite/index.html` と local `assets/` の classic IIFE static directory とする。
- Browser file adapter は `.md`、`.markdown`、`.mdx` のみを受け入れ、workspace traversal を拒否する。
- Keep implementation は shared renderer source を import し、Web Lite 内に parser／sanitizer を fork しない。
- Electron preload／IPC、Capacitor platform adapter、VS Code extension API は変更しない。
- Direct write 不可時は `.md` download へ fallback する。

## Migration

既存 user data と file format の migration はない。Web Lite の導入は新しい static directory の配置だけであり、Desktop／Mobile／VS Code の install と共存する。Rollback は static directory を削除または以前の archive に置換する。Remembered handle は browser storage を clear することで破棄でき、source document は削除しない。

## Acceptance Criteria

### AC-WEBLITE-001 — Server なしで起動できる

`npm run build:web-lite` の output を Chromium browser で `file://` から開いた場合、external CDN、backend、ES Module server を必要とせず welcome UI が表示される。

### AC-WEBLITE-002 — Current Keep core を共有する

Markdown file を開いた場合、shared Keep parser／sanitizer／editor で heading、table、task、Mermaid、KaTeX を表示・編集でき、source panel の変更を一 transaction として反映できる。

### AC-WEBLITE-003 — Browser permission と path boundary を守る

File／folder access は user-granted handle に限定し、Markdown 以外を open tree から除外し、relative traversal で workspace 外を解決しない。

### AC-WEBLITE-004 — Document fidelity と save fallback を維持する

Direct save が許可された場合は元 file へ BOM／EOL を保持して書き戻し、許可されない場合は Markdown download へ回復できる。

### AC-WEBLITE-005 — Existing product を regression させない

Desktop、Mobile、VS Code の API contract、test、production build が Web Lite 追加後も成功する。

### AC-WEBLITE-006 — Internal pilot の support boundary を明示する

Web Lite を Experimental／`NOT ELIGIBLE` とし、unsupported browser、enterprise policy、native-only non-goal、rollback を user／maintainer document に明記する。

### AC-WEBLITE-007 — 文書排版を browser local preference として調整できる

利用者は本文幅、文字 size、document zoom、line height、paragraph／heading spacing、Latin／Chinese／Japanese／code font を変更・reset でき、すべての open document へ即時反映される。Preference は Web Lite 専用 storage に保持され、reload 後に復元される。本機 font permission が拒否されても common candidate により操作を継続できる。

### AC-WEBLITE-008 — Current document state を status bar で確認・操作できる

Status bar は browser が参照可能な current path、saved／unsaved state、active table filter の shown／total count を表示する。Filter badge は clear action として機能し、local mode、manual reload、language、version は auxiliary control として残る。Source panel の未反映 draft も unsaved として扱い、narrow viewport では path を省略表示して state／filter action を失わない。

### AC-WEBLITE-009 — Source と preview を切り替え・同期できる

Source button は first click で split source を開き、second click で閉じる。Source open 中も preview pane は mouse／trackpad で scroll できるが、Keep content edit は lock される。Source textarea を scroll すると visible source line に対応する Keep block へ preview が追従する。Narrow viewport では preview と source を上下に保持し、どちらも scroll 可能とする。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

最初は社内 pilot 用 Experimental build とし、`dist-web-lite/` directory を限定利用者へ配布する。Managed Edge policy と representative Markdown で permission／save／fallback を確認するまで official publication を行わない。

## Rollback

配布済み static directory を削除または previous checksum の directory へ置換する。Desktop／Mobile／VS Code artifact と user document は変更しない。Browser に残る recent handle は site data clear で削除できる。

## Open Questions

- 社内配布を local copy、read-only file share、internal HTTP のどれに統一するかは pilot 後に owner が決定する。
- Managed browser policy で File System Access API が許可されるかは導入先 environment ごとに確認する。
