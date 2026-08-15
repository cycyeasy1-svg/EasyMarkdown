---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-EDITOR-CONTINUITY
title: 編集内容・読書位置の連続性と安全なローカルリンク
risk: L
status: verified
owner: maintainers
platforms: desktop-windows, desktop-macos, vscode, shared
last_verified: 2026-08-15
adr: docs/adr/0008-editor-continuity-and-safe-local-links.md
security_review: docs/security-threat-model.md
---

# 編集内容・読書位置の連続性と安全なローカルリンク

## Context

Upstream `horseMD` の `0.12.62` 以降には、Milkdown の高速編集、inline code、dirty 判定、document position、local link に関する修正が含まれる。本 project は Keep 編集 mode、source split、desktop／VS Code／HTML LITE の platform boundary を独自に持つため、upstream 実装の単純移植では既存 contract を破壊する可能性がある。

特に、Milkdown callback より先に tab を閉じた場合の未保存判定、再起動を越える caret／viewport、OS shell へ渡す local attachment は data loss と privilege boundary に関わる。これらを EasyMarkdown の editor API と trusted IPC contract へ再実装する。

## Goal

- Milkdown で削除、空 block、block 横断編集、即時 mode 切替／保存を行っても、利用者が入力した意味内容を失わない。
- 単一 backtick の閉じ delimiter が入力された時だけ inline code を確定し、arrow key で自然に範囲外へ移動できる。
- Milkdown callback 待機中でも tab／application close が未保存編集を検出し、保存／session capture 前に live document を同期する。
- Desktop の Keep／Milkdown／source で document を閉じる、再度開く、application を再起動する操作を越えて caret と viewport を best-effort で復元する。
- Desktop は Markdown local link を application 内で開き、安全な非 Markdown file だけを OS 既定 application へ渡す。Windows drive path、UNC、`file:` URL、relative attachment を扱う。
- VS Code は同じ local path 表現を workspace／editor navigation として扱い、HTML LITE は workspace 内 relative Markdown navigation のみに留める。

## Non-goal

- Upstream の source-preservation engine を全面移植し、Milkdown mode で Markdown の空白や delimiter 表現を byte 単位で保持することは対象外とする。表記忠実性が必要な編集は Keep／source の既存 contract とする。
- HTML LITE に `file:` URL、UNC、OS shell、workspace 外 file access を追加しない。
- Desktop local link から executable、script、shortcut、directory を起動しない。
- VS Code webview から OS shell を直接起動しない。
- Position data を cloud、workspace file、document 本文へ保存しない。

## UX

Milkdown は通常の Markdown と同様に `` `code` `` を入力した時点で inline code を表示する。未閉鎖 backtick は通常文字のまま残り、inline code 末尾で右矢印、先頭で左矢印を押すと mark の外へ caret が移動する。

未保存 indicator は DOM edit event の直後に表示し、serializer callback の遅延中も close confirmation を省略しない。Document 再 open 時は内容 fingerprint が一致する場合に限り保存済み position を復元し、不一致、破損、storage failure では document 先頭から通常表示する。

Desktop の non-Markdown local link は安全判定後に OS 既定 application で開く。危険 extension、存在しない target、directory、invalid URL は起動せず、既存 toast／error surface で通知する。Markdown は従来どおり current／right pane に開く。VS Code は editor command として開き、HTML LITE の挙動は変更しない。

## Data

- `localStorage["easymarkdown.document-positions.v1"]` に path、content fingerprint、caret Markdown offset、viewport Markdown offset、updated time を bounded LRU として保存する。
- Document 本文、selection text、workspace tree は保存しない。Path は既存 session と同じ local renderer storage 内だけに保持し、外部送信しない。
- 読み取り時に schema、number range、entry count を検証する。破損 record は無視する。
- Position data は補助情報であり、save data の source of truth にはしない。

## Contract

- Editor は user input 直後の pending dirty notification と、現在の ProseMirror document を同期 serialize する flush API を提供する。
- Application close、tab close、save、session capture は pending dirty を含めて判定し、利用可能な editor API を flush してから content を使用する。
- Position store は raw DOM offset ではなく editor 共通の Markdown offset を中心に保存し、Keep／Milkdown／source 間で best-effort に復元する。
- Preload は目的限定の `openLocalPath(href, fromPath)` API のみを公開する。Main process は trusted sender、payload size、absolute base path、target existence、file type、dangerous extension を再検証してから `shell.openPath` を呼ぶ。
- Renderer が送る resolved path を信用せず、relative href と base document path から main process が最終 path を解決する。
- VS Code は extension host で URI を解決し `vscode.open` を使用する。HTML LITE adapter contract は変更しない。

## Migration

既存 document／session／settings の変換は不要である。Position store は新規 key として lazy に作成し、未知 version や invalid entry を無視する。Preload API は additive とし、mobile／HTML LITE profile では unsupported capability のままとする。Rollback 後に position key が残っても旧 version は参照せず、document content へ影響しない。

## Acceptance Criteria

### AC-EDITOR-001 — Milkdown の高速編集が保存内容へ同期される

既存または新規 document で full／partial delete、empty paragraph／blockquote、block 横断の連続入力を行い、直後に source 切替または保存した場合、最後の user edit が失われず、空 paragraph を表す不要な `<br>` が本文へ混入しない。

### AC-EDITOR-002 — Inline code が閉じ delimiter で確定する

Milkdown で単一 backtick、本文、単一 backtick を入力した場合だけ inline code mark が確定する。未閉鎖、連続 backtick run は literal として失われず、左右 arrow で mark 境界外へ移動して通常文字を入力できる。

### AC-EDITOR-003 — Pending edit が dirty／close／save contract に含まれる

Milkdown の `markdownUpdated` より前に user input が発生した場合、tab は即時 dirty となり、tab／application close は未保存確認を行い、save／session capture は live editor content を同期してから処理する。

### AC-EDITOR-004 — Document position を安全に復元する

Keep／Milkdown／source で caret と viewport を移動して document を閉じる、再 open する、または application を再起動した場合、同一 fingerprint の document では近い Markdown position を復元する。内容不一致、invalid storage、entry 上限超過では crash せず復元を省略する。

### AC-EDITOR-005 — Desktop local Markdown link を application 内で開く

Relative path、Windows drive path、UNC、`file:` URL が Markdown target を指す場合、fragment を保持して current pane または right pane に開き、OS shell へ渡さない。

### AC-EDITOR-006 — Desktop attachment open が fail-closed である

安全な既存 non-Markdown file は main process の検証後に OS 既定 application で開く。Executable／script／shortcut、directory、NUL、oversize、存在しない target、不正 sender は `shell.openPath` へ到達せず明示的に失敗する。

### AC-EDITOR-007 — VS Code と HTML LITE の platform boundary を維持する

VS Code は relative、drive、UNC、`file:` local link を extension host の `vscode.open` で扱う。HTML LITE は workspace 内 relative Markdown link だけを扱い、`file:`／UNC／workspace 外 access を追加しない。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

最初に pure resolver／position store test と desktop Electron E2E を固定し、Desktop Windows／macOS と VS Code build へ同時適用する。HTML LITE は negative regression test で非変更を確認する。Feature flag は使用せず、position restore failure と local open rejection は既存編集を妨げない fail-safe／fail-closed とする。

## Rollback

Pending dirty hook、position store integration、local-open preload／IPC、VS Code URI resolver を個別に除去できる。Position key は削除せず無視し、document／session format は旧 version と互換を維持する。Local-open IPC を rollback した場合、non-Markdown link は従来どおり何も起動せず、Markdown internal navigation は保持する。

## Open Questions

- Directory link を file manager で開く UX は security／confirmation policy を別 feature として定義するまで対象外とする。
- Dangerous attachment の明示確認による override は採用せず、現時点では拒否を固定する。
