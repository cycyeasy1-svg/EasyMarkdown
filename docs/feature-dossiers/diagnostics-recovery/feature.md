---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-DIAGNOSTICS-RECOVERY
title: ローカル診断とセーフモード復旧
risk: L
status: verified
owner: maintainers
platforms: desktop-windows, desktop-macos
last_verified: 2026-08-09
adr: docs/adr/0001-local-diagnostics-and-safe-mode.md
security_review: docs/security-threat-model.md
---

# ローカル診断とセーフモード復旧

## Context

Renderer の予期しない例外や連続起動失敗は、白画面または起動 loop となり、利用者自身で復旧も原因切り分けもできなかった。一方、Markdown editor は機密文書を扱うため、外部 telemetry や文書本文の収集は採用できない。

詳細な log／redaction／support contract は [診断・復旧設計](../../diagnostics-and-recovery.md) を source of truth とする。

## Goal

- Renderer error を白画面にせず、利用者が再読込、safe mode、限定 reset、診断 export を選択できる。
- 起動 loop を検出して自動 safe mode に退避できる。
- 文書本文、credential、不要な user path を含まない local diagnostic evidence を取得できる。

## Non-goal

- 外部 telemetry、remote crash reporting、利用者行動 analytics は導入しない。
- disk 上の文書、local history、workspace 全体を recovery 操作で削除しない。
- 既知の recoverable filesystem error を application 全体の fatal error として扱わない。

## UX

React render error 時は recovery UI を表示し、通常再読込、safe mode、診断 export、session reset、settings reset を分離して提示する。data を失う可能性がある reset は確認 dialog を必須とする。automatic safe mode は session restore と custom theme だけを一時停止し、保存済み設定を上書きしない。

## Data

- `userData/diagnostics/main.ndjson` と最大 2 世代の archive を保持し、各 file は 1 MiB を上限とする。
- crash-loop marker は `userData` 内に保存し、recovery metadata の I/O failure は起動を妨げない。
- session と settings reset は別 key のみを削除し、disk document と local history を保持する。
- export は利用者が保存先を明示的に選択した場合だけ JSON bundle を生成する。

## Contract

- Diagnostic record は `timestamp`、`level`、`event`、`details` のみを持つ。
- Renderer event は size 制限と sender 検証を持つ preload／IPC 境界を通る。
- `EACCES`、`EPERM`、`EAGAIN`、`EBUSY`、`EMFILE`、`ENFILE` は recoverable とし、未知の uncaught exception／unhandled rejection は fatal とする。
- Renderer mount 後の `app:renderer-ready` で crash-loop failure count を reset する。

## Migration

既存 user data の変換は不要である。diagnostics directory と crash-loop marker は初回利用時に生成する。新機能を無効化または rollback しても既存文書、session、settings、local history の形式には影響しない。

## Acceptance Criteria

### AC-DIAG-001 — Renderer error から復旧操作へ到達できる

意図的な React render error が発生した場合、boot splash が残らず recovery UI が表示され、再読込、safe mode、診断 export を選択できる。

### AC-DIAG-002 — 診断情報が privacy boundary を越えない

Disk write 前と export 前の両方で redaction され、文書本文、credential、clipboard、不要な絶対 user path が diagnostic bundle に含まれない。

### AC-DIAG-003 — 連続起動失敗時に safe mode へ退避できる

5 分以内の unclean launch が 3 回連続した場合、次回起動で automatic safe mode が有効となり、session restore と custom theme を適用しない。healthy 到達後は failure count を reset する。

### AC-DIAG-004 — Reset の影響範囲が限定される

Session reset と settings reset は別操作として対象 key だけを削除し、disk document と local history を削除しない。

### AC-DIAG-005 — Recoverable error と fatal error を区別する

既知の watcher／background filesystem error は対象機能だけを停止して記録し、未知の uncaught exception／unhandled rejection は fatal log 後に exit code 1 で終了する。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

Desktop Windows／macOS に同時適用する。診断 I/O は failure-safe とし、書き込み不能でも editor 起動を継続する。Release 前に unit、security regression、Electron smoke E2E を実施する。

## Rollback

Error Boundary wrapper、diagnostic IPC 登録、crash-loop tracker の初期化を除去することで旧動作へ戻せる。生成済み diagnostics file と marker は application data として残っても既存機能へ影響せず、rollback 時に自動削除しない。

## Open Questions

- 外部 telemetry は現時点で採用しない。将来導入する場合は新しい privacy review と ADR を必須とする。
