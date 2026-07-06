const vscode = require('vscode')
// Pure filename sanitizer shared with the desktop app's image:save IPC — same
// naming convention for pasted images on both sides.
const { imageNameParts } = require('../../../src/main/helpers.js')

const VIEW_TYPE = 'easymarkdown.keep'
const LAYOUT_KEY = 'easymarkdown.keep.layout'
// Last editor mode the user chose ('keep' | 'source'), so the next Markdown file
// opens the same way. Read by the tab-open watcher in extension.js.
const MODE_KEY = 'easymarkdown.keep.preferredMode'
// In-editor overrides for color theme ('auto' | 'warm-light' | 'warm-dark') and
// UI language ('auto' | 'en' | 'zh' | 'ja'), chosen from the settings panel and
// shared across every keep editor (mirrors the app's single prefs object).
const THEME_KEY = 'easymarkdown.keep.theme'
const LANG_KEY = 'easymarkdown.keep.lang'

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
    this.panels = new Map() // uriString -> live webviewPanel (for cross-file anchor jumps)
    this.pendingAnchor = new Map() // uriString -> #fragment to apply once the editor opens
  }

  static register(context) {
    const provider = new KeepEditorProvider(context)
    return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    })
  }

  resolveCustomTextEditor(document, webviewPanel) {
    // NOTE: resolving does NOT update MODE_KEY. Keep is the platform default
    // editor, so files auto-open here even when the user's explicit preference
    // is 'source' (the tab watcher then reverts them) — recording every resolve
    // as a preference would overwrite that choice. Only explicit actions
    // (the commands / the in-editor Source button) update the preference.
    const docKey = document.uri.toString()
    this.panels.set(docKey, webviewPanel)
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

    // ── scroll sync (keep view ⇄ a side-by-side source editor of the same file) ──
    // Timestamp windows (not one-shot flags) suppress echo: a revealRange / a
    // programmatic webview scroll emits a STREAM of scroll events, not one.
    const scrollSyncOn = () =>
      vscode.workspace.getConfiguration('easymarkdown.keep').get('scrollSync', true)
    let suppressEditorScrollUntil = 0
    let editorScrollTimer = null

    const baseUri = webview.asWebviewUri(docDir).toString()
    webview.html = this.getHtml(webview)

    const lang = resolveLang(this.context)

    const postInit = () => {
      lastKnownText = document.getText()
      // A cross-file link may have queued a #fragment for this document before
      // the editor resolved — deliver it with the init so the webview can jump
      // once the first paint lands.
      const anchor = this.pendingAnchor.get(docKey) || null
      this.pendingAnchor.delete(docKey)
      webview.postMessage({
        type: 'init',
        text: lastKnownText,
        baseUri,
        lang, // resolved code (en/zh/ja) used to render
        langPref: this.context.globalState.get(LANG_KEY) || 'auto', // for the picker
        theme: this.context.globalState.get(THEME_KEY) || 'auto',
        layout: this.context.globalState.get(LAYOUT_KEY) || null,
        anchor
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
      } else if (msg.type === 'saveImage') {
        this.saveImage(document, webview, msg)
      } else if (msg.type === 'openRelative') {
        this.openRelative(document, webview, msg.href)
      } else if (msg.type === 'visibleLine') {
        // Webview scrolled → align every visible text editor of the same file.
        if (!scrollSyncOn()) return
        suppressEditorScrollUntil = Date.now() + 250
        const line = Math.max(0, Math.min(msg.line | 0, document.lineCount - 1))
        for (const ed of vscode.window.visibleTextEditors) {
          if (ed.document.uri.toString() === docKey) {
            ed.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop)
          }
        }
      } else if (msg.type === 'layout') {
        // Persist layout prefs globally (mirrors the app's single localStorage
        // prefs object), so every keep editor shares the same layout.
        this.context.globalState.update(LAYOUT_KEY, msg.layout)
      } else if (msg.type === 'theme') {
        this.context.globalState.update(THEME_KEY, msg.theme)
      } else if (msg.type === 'lang') {
        this.context.globalState.update(LANG_KEY, msg.lang)
      } else if (msg.type === 'switchToSource') {
        // The in-editor "source" button → reopen this file in the text editor,
        // and remember source as the preferred mode for the next file.
        this.context.globalState.update(MODE_KEY, 'source')
        vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
      }
    })

    // Source editor scrolled → tell the webview to align to its top line.
    const scrollSub = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (e.textEditor.document.uri.toString() !== docKey) return
      if (!scrollSyncOn()) return
      if (Date.now() < suppressEditorScrollUntil) return // echo of our own reveal
      const first = e.visibleRanges[0]
      if (!first) return
      clearTimeout(editorScrollTimer)
      editorScrollTimer = setTimeout(() => {
        webview.postMessage({ type: 'scrollToLine', line: first.start.line })
      }, 100)
    })

    webviewPanel.onDidDispose(() => {
      changeSub.dispose()
      msgSub.dispose()
      scrollSub.dispose()
      clearTimeout(editorScrollTimer)
      if (this.panels.get(docKey) === webviewPanel) this.panels.delete(docKey)
    })
  }

  /**
   * Open a document-relative link from the webview: `guide/setup.md#install`,
   * `../notes.md`, `./spec.pdf`, … Resolved against the document's folder. A
   * markdown target honors the user's preferred mode (the tab watcher reopens it
   * in keep mode when that's the preference); other files open with whatever
   * editor VSCode associates. A #fragment on the same document just scrolls; on
   * another document it's queued (pendingAnchor) or posted to the live panel.
   */
  async openRelative(document, webview, href) {
    try {
      const hashAt = String(href).indexOf('#')
      const pathPart = hashAt >= 0 ? String(href).slice(0, hashAt) : String(href)
      const fragment = hashAt >= 0 ? String(href).slice(hashAt + 1) : ''
      let rel = ''
      try {
        rel = decodeURIComponent(pathPart)
      } catch {
        rel = pathPart
      }
      if (!rel) {
        if (fragment) webview.postMessage({ type: 'scrollToAnchor', slug: fragment })
        return
      }
      const target = vscode.Uri.joinPath(document.uri, '..', ...rel.split(/[\\/]+/))
      const targetKey = target.toString()
      if (targetKey === document.uri.toString()) {
        if (fragment) webview.postMessage({ type: 'scrollToAnchor', slug: fragment })
        return
      }
      try {
        await vscode.workspace.fs.stat(target)
      } catch {
        vscode.window.showWarningMessage(`EasyMarkdown: file not found — ${rel}`)
        return
      }
      const existing = this.panels.get(targetKey)
      if (existing) {
        // retainContextWhenHidden: the webview is live — reveal + jump directly.
        existing.reveal()
        if (fragment) existing.webview.postMessage({ type: 'scrollToAnchor', slug: fragment })
        return
      }
      if (fragment) this.pendingAnchor.set(targetKey, fragment)
      await vscode.commands.executeCommand('vscode.open', target)
    } catch {
      /* ignore malformed links */
    }
  }

  /**
   * Save a pasted/dropped image into an `assets/` folder next to the document
   * (Typora-style, matching the desktop app's image:save IPC) and reply with the
   * POSIX-relative path to insert. The webview does the actual markdown insert
   * through its normal minimal-diff commit path — the host never edits the
   * document here. An untitled document has no folder to save into → error.
   */
  async saveImage(document, webview, msg) {
    const fail = (code) => webview.postMessage({ type: 'imageError', reqId: msg.reqId, code })
    try {
      if (document.uri.scheme !== 'file') return fail('untitled')
      const dir = vscode.Uri.joinPath(document.uri, '..', 'assets')
      await vscode.workspace.fs.createDirectory(dir) // recursive + idempotent
      const { stem, ext } = imageNameParts(msg.name)
      // Non-clobbering name: probe stem.ext, stem-1.ext, … (stat throws = free).
      let fileName = stem + ext
      for (let n = 1; ; n++) {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.joinPath(dir, fileName))
          fileName = `${stem}-${n}${ext}`
        } catch {
          break
        }
      }
      const bytes = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes)
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, fileName), bytes)
      webview.postMessage({ type: 'imageSaved', reqId: msg.reqId, relPath: 'assets/' + fileName })
    } catch (e) {
      fail((e && e.message) || String(e))
    }
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

// Language priority: the in-editor override (settings panel) wins, then the
// settings.json config, then VSCode's display language. Each falls through on
// 'auto' / unset.
function resolveLang(context) {
  const override = context && context.globalState.get(LANG_KEY)
  if (override && override !== 'auto') return override
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

module.exports = { KeepEditorProvider, VIEW_TYPE, MODE_KEY }
