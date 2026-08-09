# 診断・復旧設計

Last verified: 2026-08-09

## 1. 目的

本設計は、白画面や起動 loop を避け、利用者自身が privacy を損なわずに復旧・一次切り分けできる状態を定義する。外部 telemetry や文書内容の収集は対象外とし、診断情報は local device 内にのみ保存する。

## 2. 構成

- main process は `userData/diagnostics` に構造化 NDJSON log を保存する。
- Renderer の render error は `AppErrorBoundary` が捕捉し、再読込、safe mode、診断 export、限定 reset を提示する。
- Renderer の global error／unhandled rejection は、size 制限付き IPC を通じて main log へ記録する。
- 診断 report は利用者が明示的に保存先を選択した場合だけ JSON として export する。

## 3. Local log contract

各 record は `timestamp`、`level`、`event`、`details` のみを持つ。現在の `main.ndjson` と最大 2 世代の archive を保持し、各 file は 1 MiB を上限とする。log I/O failure は application 起動を妨げない。

以下は disk write 前と report export 前の両方で redaction する。

- Markdown／HTML／document content、clipboard data
- password、token、cookie、authorization、API key
- user document、userData、stack trace に含まれる不要な絶対 path
- 過大な string、array、object、循環参照

文書本文を debug log に渡す実装は禁止する。新しい event は技術 ID と少量の状態値だけを記録する。

## 4. 復旧 policy

### 4.1 Renderer error

React render error が発生した場合、boot splash を除去して recovery UI を表示する。通常の再読込で改善しない場合は renderer safe mode を選択できる。safe mode は session 復元と custom theme を一時的に無効化するが、既存 localStorage data を上書きしない。

session reset と settings reset は別操作とし、確認 dialog の後に対象 key だけを削除する。session reset は session 内だけに存在する未保存 scratch tab を失う可能性があるため、その旨を明示する。disk 上の文書と local history は削除しない。

### 4.2 Crash-loop safe mode

main process は launch marker を保存する。5 分以内に renderer-ready へ到達できない起動が 3 回連続した場合、次回起動を automatic safe mode とする。Renderer が mount して `app:renderer-ready` を通知した時点で failure count を reset する。

### 4.3 Main process fatal policy

`EACCES`、`EPERM`、`EAGAIN`、`EBUSY`、`EMFILE`、`ENFILE` は watcher／background filesystem の recoverable error として log し、対象機能だけを停止する。未知の uncaught exception／unhandled rejection は fatal として記録し、unsafe な process 継続は行わず exit code 1 で終了する。

## 5. Support 手順

1. Recovery UI または「設定 → 診断情報」から report を export する。
2. report に文書本文、credential、絶対 user path がないことを利用者自身でも確認する。
3. `event` と timestamp を基に再現操作と突き合わせる。
4. safe mode で再現しない場合は session または custom theme を優先して調査する。
5. reset は必ず session と settings を分け、広範な userData 削除を案内しない。

## 6. 変更時の検証

- Error Boundary に意図的な render error を与え、recovery UI と診断 event を確認する。
- redaction test に secret、文書本文、Windows／macOS／Linux path を含める。
- crash-loop の threshold、window、healthy reset を unit test する。
- preload／IPC／BrowserWindow lifecycle を変更した場合は desktop smoke E2E を実施する。
