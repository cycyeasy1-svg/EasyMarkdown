const vscode = require('vscode')
const { KeepEditorProvider, MODE_KEY } = require('./keepEditorProvider')

const KEEP_VIEW_TYPE = 'easymarkdown.keep'
const MD_RE = /\.(md|markdown)$/i

// Resolve the Markdown file the user is acting on. From the editor-title menu the
// command is invoked WITH the resource Uri; from the palette / keybinding it is
// not, so fall back to the active tab (works for both the text editor and our
// custom editor — TabInputText and TabInputCustom both carry `.uri`).
function activeResourceUri(uriArg) {
  if (uriArg instanceof vscode.Uri) return uriArg
  const input = vscode.window.tabGroups.activeTabGroup?.activeTab?.input
  if (input && input.uri instanceof vscode.Uri) return input.uri
  return vscode.window.activeTextEditor?.document.uri
}

// Localized title for the top-of-file CodeLens (the most discoverable entry point
// into keep mode — clickable text right in the source document).
function keepLensTitle() {
  const loc = (vscode.env.language || 'en').toLowerCase()
  if (loc.startsWith('zh')) return '$(book) 用保持模式打开'
  if (loc.startsWith('ja')) return '$(book) キープモードで開く'
  return '$(book) Open in Keep Mode'
}

// A single CodeLens at the top of every Markdown source file. It only renders in
// the text editor (the source), so it never shows inside the keep custom editor.
const keepCodeLensProvider = {
  provideCodeLenses(document) {
    const top = new vscode.Range(0, 0, 0, 0)
    return [
      new vscode.CodeLens(top, {
        title: keepLensTitle(),
        command: 'easymarkdown.openWithKeep',
        arguments: [document.uri]
      })
    ]
  }
}

// Auto-follow the last EXPLICITLY chosen mode, in both directions. Keep is the
// platform default editor (priority: "default"), so with preferred mode 'keep'
// (or none) nothing needs converting; with preferred mode 'source', auto-opened
// keep tabs are reopened as text. The 'text → keep' direction still matters for
// tabs VSCode hands to the text editor (e.g. an Explorer click REPLACING an
// existing tab's editor — that surfaces as a `changed` event, not `opened`,
// which is why both are handled; missing `changed` was the old "clicking an
// already-open file flips it back to source" bug).
//
// `changed` also fires for dirty/label/pin updates, so a changed tab only
// counts as an editor swap when its editor KIND actually flipped (tracked per
// tab in `lastKind`). `suppressed` (shared with the commands) keeps the watcher
// away from a uri we're acting on ourselves — e.g. "Open Keep to the Side"
// while the preferred mode is source must not be instantly reverted.
function watchTabsForKeep(context, suppressed) {
  const rememberOn = () =>
    vscode.workspace.getConfiguration('easymarkdown.keep').get('rememberMode', true)
  const lastKind = new Map() // "uri|viewColumn" -> 'keep' | 'text'

  const classify = (tab) => {
    const input = tab && tab.input
    if (input instanceof vscode.TabInputText && input.uri && MD_RE.test(input.uri.path)) {
      return { uri: input.uri, kind: 'text' }
    }
    if (input instanceof vscode.TabInputCustom && input.viewType === KEEP_VIEW_TYPE) {
      return { uri: input.uri, kind: 'keep' }
    }
    return null
  }
  const keyOf = (tab, c) => c.uri.toString() + '|' + (tab.group?.viewColumn ?? 0)

  const handle = (tab, isOpen) => {
    const c = classify(tab)
    if (!c) return
    const key = keyOf(tab, c)
    const prev = lastKind.get(key)
    lastKind.set(key, c.kind)
    // A changed event is an editor swap only when the kind VISIBLY flipped.
    // Unknown prev (e.g. a session-restored tab whose first event is a dirty
    // change) is not a swap — just record it.
    if (!isOpen && (prev === undefined || prev === c.kind)) return
    if (!rememberOn()) return
    const pref = context.globalState.get(MODE_KEY) || 'keep'
    const want = pref === 'source' ? 'text' : 'keep'
    if (c.kind === want) return
    const uriKey = c.uri.toString()
    if (suppressed.has(uriKey)) return
    suppressed.add(uriKey)
    const release = () => setTimeout(() => suppressed.delete(uriKey), 500)
    vscode.commands
      .executeCommand(
        'vscode.openWith',
        c.uri,
        want === 'keep' ? KEEP_VIEW_TYPE : 'default',
        tab.group?.viewColumn
      )
      .then(release, release)
  }

  return vscode.window.tabGroups.onDidChangeTabs((e) => {
    e.closed.forEach((tab) => {
      const c = classify(tab)
      if (c) lastKind.delete(keyOf(tab, c))
    })
    e.opened.forEach((t) => handle(t, true))
    e.changed.forEach((t) => handle(t, false))
  })
}

function activate(context) {
  // Uris the extension itself is currently switching — the tab watcher must not
  // "correct" them. Shared with watchTabsForKeep.
  const suppressed = new Set()
  const holdSuppress = (uri, ms = 1500) => {
    const key = uri.toString()
    suppressed.add(key)
    setTimeout(() => suppressed.delete(key), ms)
  }

  context.subscriptions.push(
    KeepEditorProvider.register(context),
    watchTabsForKeep(context, suppressed),
    vscode.commands.registerCommand('easymarkdown.openWithKeep', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      if (uri) {
        await context.globalState.update(MODE_KEY, 'keep')
        holdSuppress(uri)
        await vscode.commands.executeCommand('vscode.openWith', uri, KEEP_VIEW_TYPE)
      }
    }),
    vscode.commands.registerCommand('easymarkdown.openWithText', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      // 'default' reopens with VSCode's built-in text editor (source mode), and
      // source becomes the preferred mode for the next file.
      if (uri) {
        await context.globalState.update(MODE_KEY, 'source')
        holdSuppress(uri)
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default')
      }
    }),
    vscode.commands.registerCommand('easymarkdown.openKeepToSide', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      // Open the keep editor in a split beside the source — both bind to the same
      // TextDocument, so edits on either side stay live-synced (zero-diff). This
      // deliberately does NOT change the preferred mode; the suppression window
      // stops the watcher from reverting the side panel when the preference is
      // source.
      if (uri) {
        holdSuppress(uri)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          KEEP_VIEW_TYPE,
          vscode.ViewColumn.Beside
        )
      }
    }),
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, keepCodeLensProvider)
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
