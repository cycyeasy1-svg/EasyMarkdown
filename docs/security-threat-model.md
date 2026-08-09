# EasyMarkdown セキュリティ脅威モデル

| 項目 | 内容 |
| --- | --- |
| Status | Active |
| Owner | Maintainers |
| Created | 2026-08-09 |
| Last verified | 2026-08-09 |
| Scope | Desktop Electron app（main／preload／renderer／local file／release） |

## 1. 目的と前提

EasyMarkdown は、利用者が選択したローカル Markdown、text、image、attachment、custom theme を処理する。これらの内容は信頼しない。一方、packaged renderer code と main process code は trusted code として扱う。ただし renderer の XSS、dependency compromise、誤った IPC 呼び出しが発生しても、OS 権限へ直接昇格できない多層防御を必要とする。

本モデルは、次を保護対象とする。

- 利用者の document、workspace、local history、session、setting。
- OS 上の document 以外の file／directory。
- clipboard、external browser、printer、local font permission。
- update／release artifact と配布経路。
- 文書本文、file path 等の privacy 情報。

## 2. Trust boundary

```text
Untrusted local Markdown / HTML / CSS / image / attachment
                         |
                         v
Sandboxed renderer (no Node.js)
                         |
              contextBridge allowlist
                         |
                         v
Trusted IPC facade (main-frame sender + URL + payload policy)
                         |
                         v
Main process / filesystem / shell / clipboard / print / update
```

- Renderer は `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` とする。
- sandboxed preload は ESM を使用できないため、単一の `out/preload/index.cjs` へ bundle する。
- Renderer から main への全 channel は `createTrustedIpcMain` を経由する。
- sender は main `webContents` と同一であるだけでなく、`senderFrame === webContents.mainFrame` かつ現在の app URL と一致しなければならない。

## 3. 脅威と対策

| ID | 脅威 | 影響 | 現在の対策 | 残課題 |
| --- | --- | --- | --- | --- |
| T-01 | Markdown／raw HTML による script 実行 | renderer XSS、IPC 悪用 | raw HTML sanitize、renderer CSP、Node 無効、sandbox | sanitizer regression test を継続 |
| T-02 | iframe／child frame から privileged IPC | 任意 file read／write／delete | main-frame identity、URL、webContents の三重確認 | custom protocol 移行を検討 |
| T-03 | relative path／NUL／restricted root を IPC に送信 | CWD 誤解決、system tree watch、広範囲操作 | `validateIpcArgs`、absolute path、restricted root policy | workspace capability 単位の allowlist |
| T-04 | malicious link／scheme | OS handler の誤起動 | URL allowlist、navigation deny、window-open deny | allowlist 変更時に test 必須 |
| T-05 | print HTML が hidden window で active content を実行 | hidden renderer abuse、remote load | sandbox、Node 無効、`webSecurity: true`、CSP、file image の data URL 化 | print regression の自動化範囲拡大 |
| T-06 | custom theme CSS の traversal／remote resource | local file disclosure、UI spoofing、tracking | theme root containment、`..` reject、permission handshake | remote `url()` の block／warning を検討 |
| T-07 | attachment／paste image の path／name abuse | overwrite、assets 外 write | absolute source path、generated non-clobbering name、`COPYFILE_EXCL` | file size／type policy は UX と合わせて定義 |
| T-08 | watcher が system／device tree を走査 | crash、hang、resource exhaustion | absolute path、restricted root、depth 0、symlink 無効、error handler、recoverable/fatal 分離 | 新しい filesystem error code は分類 test を追加 |
| T-09 | update API／release asset の改ざん | malicious update の配布 | HTTPS notify-only check、external browser download | signing、notarization、checksum、provenance |
| T-10 | log／diagnostic に本文または path が残る | privacy leak | local-only bounded log、二重 redaction、user-triggered export、payload size 制限 | event 追加時に privacy regression test を継続 |

## 4. IPC security contract

新規 IPC は次を満たすこと。

1. `electronIpcMain` を直接使用せず、composition root が生成する trusted facade へ登録する。
2. Renderer には channel 名や raw `ipcRenderer` を公開せず、目的別の関数だけを `contextBridge` で公開する。
3. file path は absolute、NUL 無し、上限長以内であることを main 側でも検証する。
4. delete／rename／recursive read／watch は filesystem root と restricted system tree を拒否する。
5. 複雑な payload は feature module で schema／size／enum を検証する。
6. 不正 sender は処理せず、不正 payload は明示的に失敗させる。
7. channel の正常系、不正 sender、不正 payload、cleanup を unit test する。

## 5. Content／window security contract

- main window と hidden utility window は sandbox、context isolation、Node 無効を既定とする。
- `webSecurity: false` と `allowRunningInsecureContent: true` を禁止する。
- app 外への navigation と child window 作成を禁止し、許可済み URL は OS browser へ渡す。
- hidden HTML document は CSP で script、network、frame、object を禁止する。
- untrusted document 由来の HTML を保存・印刷する場合、script を実行する window として扱わない。
- permission は default deny とし、local font のような必要機能だけを短時間 grant する。

## 6. Release security

現時点の package は未署名であり、正式配布の残課題である。正式版 gate を `DONE` にするには次が必要となる。

- Windows Authenticode code signing。
- macOS Developer ID signing と notarization。
- release asset checksum と build provenance。
- signing secret を repository／artifact／log に出力しない GitHub Actions 設定。
- install、upgrade、rollback の platform manual smoke evidence。

署名 credential は repository に保存しない。credential が設定されていない workflow は、正式版 publish を行わない運用へ移行する。

## 7. Privacy

- document 本文、clipboard 内容、absolute path を telemetry として自動送信しない。
- crash／diagnostic は local 保存と user-triggered export のみとし、自動 upload しない。
- export 前に token、URL credential、user name を含む path、document excerpt を redaction する。
- remote crash service を導入する場合は opt-in／consent／retention を別途設計する。

## 8. 検証と更新条件

次の変更では本書と security regression test を更新する。

- preload API、IPC channel、file operation の追加・変更。
- raw HTML、custom theme、external URL、attachment、print／export の変更。
- Electron major version 更新。
- updater、auto-download、code signing、notarization の導入。
- log、crash report、diagnostic export の導入。

参考: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm)。
