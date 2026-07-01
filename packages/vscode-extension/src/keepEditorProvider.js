const vscode = require('vscode')

const VIEW_TYPE = 'easymarkdown.keep'
const LAYOUT_KEY = 'easymarkdown.keep.layout'

/**
 * CustomTextEditorProvider for "keep mode" — the TextDocument is the single
 * source of truth. The webview renders it and sends back line-scoped edits
 * ({startLine,endLine,lines}); we apply each as ONE WorkspaceEdit that replaces
 * exactly that line range, so untouched bytes never move (the "zero diff" goal).
 * VSCode owns dirty / undo-redo / save.
 */
class KeepEditorProvider {
  constructor(context) {
    this.context = context
  }

  static register(context) {
    const provider = new KeepEditorProvider(context)
    return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    })
  }

  resolveCustomTextEditor(document, webviewPanel) {
    const webview = webviewPanel.webview
    const docDir = vscode.Uri.joinPath(document.uri, '..')
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        docDir
      ]
    }

    // `lastKnownText` is what the document held the last time we synced the
    // webview. The change handler compares against it to push genuine external /
    // undo-redo changes. `ownEditPending` swallows exactly one change event — the
    // echo of the webview's own edit we just applied — so the webview isn't told
    // to re-render its own change (which would drop an open edit popover). EOL
    // differences make a text compare unreliable here, so we use a one-shot flag.
    let lastKnownText = document.getText()
    let ownEditPending = false

    const baseUri = webview.asWebviewUri(docDir).toString()
    webview.html = this.getHtml(webview)

    const lang = resolveLang()

    const postInit = () => {
      lastKnownText = document.getText()
      webview.postMessage({
        type: 'init',
        text: lastKnownText,
        baseUri,
        lang,
        layout: this.context.globalState.get(LAYOUT_KEY) || null
      })
    }

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return
      const text = document.getText()
      if (ownEditPending) {
        // The echo of our own applied edit — swallow it (no re-render).
        ownEditPending = false
        lastKnownText = text
        return
      }
      if (text === lastKnownText) return
      lastKnownText = text
      webview.postMessage({ type: 'update', text })
    })

    const msgSub = webview.onDidReceiveMessage((msg) => {
      if (!msg) return
      if (msg.type === 'ready') {
        postInit()
      } else if (msg.type === 'replaceLines') {
        // Mark the upcoming change as our own so its echo is swallowed. The
        // webview only sends this when there is a real diff, so applyEdit always
        // fires exactly one change event to consume the flag.
        ownEditPending = true
        vscode.workspace.applyEdit(this.buildLineEdit(document, msg)).then((ok) => {
          if (!ok) ownEditPending = false
        })
      } else if (msg.type === 'openExternal') {
        try {
          vscode.env.openExternal(vscode.Uri.parse(msg.url))
        } catch {
          /* ignore malformed url */
        }
      } else if (msg.type === 'layout') {
        // Persist layout prefs globally (mirrors the app's single localStorage
        // prefs object), so every keep editor shares the same layout.
        this.context.globalState.update(LAYOUT_KEY, msg.layout)
      } else if (msg.type === 'switchToSource') {
        // The in-editor "source" button → reopen this file in the text editor.
        vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
      }
    })

    webviewPanel.onDidDispose(() => {
      changeSub.dispose()
      msgSub.dispose()
    })
  }

  /**
   * Apply a single line-range replacement. `endLine` may be `startLine - 1` to
   * signal a pure insertion before `startLine`. Incoming lines may carry a
   * trailing '\r' (webview kept them); we strip it and re-join with the
   * document's own EOL so the file's line-ending convention is preserved.
   */
  buildLineEdit(document, { startLine, endLine, lines }) {
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
    const norm = (l) => (l.endsWith('\r') ? l.slice(0, -1) : l)
    const clean = (lines || []).map(norm)
    const edit = new vscode.WorkspaceEdit()
    const uri = document.uri

    if (endLine < startLine) {
      // Insertion at startLine (or at EOF when startLine === lineCount).
      if (startLine >= document.lineCount) {
        // Append at end of document.
        const last = document.lineCount - 1
        const end = document.lineAt(last).range.end
        edit.insert(uri, end, clean.map((l) => eol + l).join(''))
      } else {
        const pos = new vscode.Position(startLine, 0)
        edit.insert(uri, pos, clean.map((l) => l + eol).join(''))
      }
    } else {
      const endRange = document.lineAt(endLine).rangeIncludingLineBreak
      const includedBreak = endRange.end.line !== endLine
      let text = clean.join(eol)
      if (clean.length > 0 && includedBreak) text += eol
      const range = new vscode.Range(new vscode.Position(startLine, 0), endRange.end)
      edit.replace(uri, range, text)
    }
    return edit
  }

  getHtml(webview) {
    const nonce = makeNonce()
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    )
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ')

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div class="editor-scroll km-scroll"><div class="km-doc" id="km-host"></div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function resolveLang() {
  const cfg = vscode.workspace.getConfiguration('easymarkdown.keep').get('language', 'auto')
  if (cfg && cfg !== 'auto') return cfg
  const loc = (vscode.env.language || 'en').toLowerCase()
  if (loc.startsWith('zh')) return 'zh'
  if (loc.startsWith('ja')) return 'ja'
  return 'en'
}

function makeNonce() {
  let t = ''
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) t += chars.charAt(Math.floor(Math.random() * chars.length))
  return t
}

module.exports = { KeepEditorProvider }
