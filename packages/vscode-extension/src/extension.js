const vscode = require('vscode')
const { KeepEditorProvider, MODE_KEY } = require('./keepEditorProvider')
const { navigationTargetFromSelection, isRecentNavigationTarget } = require('./openMode')

const KEEP_VIEW_TYPE = 'easymarkdown.keep'
const MD_RE = /\.(md|markdown)$/i

function isMarkdownFileUri(uri) {
  return uri instanceof vscode.Uri && uri.scheme === 'file' && MD_RE.test(uri.path)
}

function isDiffInput(input) {
  return input instanceof vscode.TabInputTextDiff
}

function diffInputHasUri(input, uri) {
  if (!isDiffInput(input) || !(uri instanceof vscode.Uri)) return false
  const key = uri.toString()
  return input.original.toString() === key || input.modified.toString() === key
}

function isUriInOpenDiff(uri) {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (diffInputHasUri(tab.input, uri)) return true
    }
  }
  return false
}

// Resolve the Markdown file the user is acting on. From the editor-title menu the
// command is invoked WITH the resource Uri; from the palette / keybinding it is
// not, so fall back to the active tab (works for both the text editor and our
// custom editor — TabInputText and TabInputCustom both carry `.uri`).
function activeResourceUri(uriArg) {
  const input = vscode.window.tabGroups.activeTabGroup?.activeTab?.input
  if (uriArg instanceof vscode.Uri) {
    if (diffInputHasUri(input, uriArg)) return undefined
    return uriArg
  }
  if (isDiffInput(input)) return undefined
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
    if (!isMarkdownFileUri(document.uri) || isUriInOpenDiff(document.uri)) return []
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

// Auto-follow the last EXPLICITLY chosen mode, in both directions. Keep is
// contributed as an optional custom editor so VSCode's diff editor can keep
// using source text; normal Markdown tabs are switched here when the preferred
// mode is keep. The text-to-keep direction still matters for
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
function watchTabsForKeep(context, suppressed, keepProvider) {
  const rememberOn = () =>
    vscode.workspace.getConfiguration('easymarkdown.keep').get('rememberMode', true)
  const lastKind = new Map() // "uri|viewColumn" -> 'keep' | 'text'
  const recentNavigation = new Map() // uriString -> command-driven selection/cursor target
  const switchingToKeep = new Set() // uriString values currently crossing openWith
  const pendingKeepChecks = new Map() // Tab -> short delay that lets VSCode apply an open selection

  const navigationFromSelectionEvent = (event) => {
    const editor = event?.textEditor
    if (!editor || !isMarkdownFileUri(editor.document?.uri)) return null
    // VSCode uses Command for navigation-owned cursor/selection changes: Search
    // results, file:line quick-open targets, Problems/References, and similar
    // workbench jumps. Ordinary file opens and restored cursor state arrive
    // without this kind, while direct user input reports Keyboard or Mouse.
    const selection = editor.selection
    if (!selection) return null
    const canRevealInKeep =
      !selection.isEmpty &&
      selection.start.line === selection.end.line &&
      selection.end.character - selection.start.character <= 1000
    return navigationTargetFromSelection({
      kind: event.kind,
      commandKind: vscode.TextEditorSelectionChangeKind.Command,
      selection,
      selectedText: canRevealInKeep ? editor.document.getText(selection) : ''
    })
  }

  const selectionSub = vscode.window.onDidChangeTextEditorSelection((e) => {
    const uri = e.textEditor?.document?.uri
    if (!isMarkdownFileUri(uri)) return
    const navigation = navigationFromSelectionEvent(e)
    if (!navigation) return
    const uriKey = uri.toString()
    recentNavigation.set(uriKey, navigation)
    // The selection event can land just after openWith started. Relay it to an
    // already-resolving/ready keep panel as long as this URI is still in the
    // automatic text-to-keep transition window.
    if (switchingToKeep.has(uriKey) && navigation.text) {
      keepProvider.queueSearchReveal(uri, navigation)
    }
  })

  const classify = (tab) => {
    const input = tab && tab.input
    if (input instanceof vscode.TabInputText && isMarkdownFileUri(input.uri)) {
      return { uri: input.uri, kind: 'text' }
    }
    if (
      input instanceof vscode.TabInputCustom &&
      input.viewType === KEEP_VIEW_TYPE &&
      isMarkdownFileUri(input.uri)
    ) {
      return { uri: input.uri, kind: 'keep' }
    }
    return null
  }
  const keyOf = (tab, c) => c.uri.toString() + '|' + (tab.group?.viewColumn ?? 0)

  const handle = (tab, isOpen, allowSelectionDelay = true) => {
    const c = classify(tab)
    if (!c) return
    const key = keyOf(tab, c)
    const prev = lastKind.get(key)
    lastKind.set(key, c.kind)
    // A changed event is an editor swap only when the kind VISIBLY flipped.
    // Unknown prev (e.g. a session-restored tab whose first event is a dirty
    // change) is not a swap — just record it.
    if (!isOpen && (prev === undefined || prev === c.kind)) return
    const pref = rememberOn() ? context.globalState.get(MODE_KEY) || 'keep' : 'keep'
    const want = pref === 'source' ? 'text' : 'keep'
    if (c.kind === want) return
    const uriKey = c.uri.toString()
    if (suppressed.has(uriKey)) return

    // Navigation-owned opens stay in source mode so VSCode keeps the precise
    // cursor/range, diagnostics, and native highlight. This is a one-document
    // override only; it deliberately does not change the remembered mode used
    // by ordinary browsing opens.
    const navigation = recentNavigation.get(uriKey)
    if (
      want === 'keep' &&
      c.kind === 'text' &&
      isRecentNavigationTarget(navigation)
    ) {
      recentNavigation.delete(uriKey)
      return
    }

    // Tab-open notifications can precede the TextEditor selection event by a
    // few frames. Give native navigation (Search, file:line, Problems, etc.) a
    // short window to apply its command-owned cursor/selection before deciding
    // this was a plain browsing open that should follow the remembered mode.
    if (want === 'keep' && c.kind === 'text' && allowSelectionDelay) {
      if (!pendingKeepChecks.has(tab)) {
        const timer = setTimeout(() => {
          pendingKeepChecks.delete(tab)
          const stillOpen = vscode.window.tabGroups.all.some((group) => group.tabs.includes(tab))
          if (stillOpen) handle(tab, true, false)
        }, 120)
        pendingKeepChecks.set(tab, timer)
      }
      return
    }

    suppressed.add(uriKey)
    if (want === 'keep' && c.kind === 'text') {
      switchingToKeep.add(uriKey)
    }
    const original = tab
    // A single Explorer click opens the file as a PREVIEW (italic) tab. Each
    // group has ONE preview slot, shared across editor kinds, so re-opening as a
    // preview reuses that slot: keep swaps in for the source text IN PLACE — no
    // second tab, no flash. (We must keep priority `option` so VSCode's diff
    // editor isn't hijacked, which means the source text always opens first;
    // this preview reuse is what hides that transition.)
    const wasPreview = !!tab.isPreview
    const release = () =>
      setTimeout(() => {
        suppressed.delete(uriKey)
        switchingToKeep.delete(uriKey)
        recentNavigation.delete(uriKey)
      }, 500)
    vscode.commands
      .executeCommand('vscode.openWith', c.uri, want === 'keep' ? KEEP_VIEW_TYPE : 'default', {
        viewColumn: tab.group?.viewColumn,
        preview: wasPreview,
        // This is an automatic editor-kind swap, not an explicit request to
        // start editing. Preserve Explorer/Search focus so commands such as F2
        // still act on the selected file after opening it.
        preserveFocus: true
      })
      .then(
        () => {
          // Preview slot was reused — nothing to clean up (closing `original`
          // here would close the freshly-swapped-in editor, same slot).
          if (wasPreview) return
          // A permanent (double-clicked / pinned) tab has no shared slot, so
          // `openWith` ADDS a tab: text + keep coexist for one uri, and both
          // collide on the single `lastKind` key (uri|viewColumn) — closing one
          // then makes the watcher re-open it forever. Close the now-redundant
          // original so exactly one tab of the wanted kind survives. If openWith
          // replaced in place, `original` already reflects `want` and we skip.
          const oc = classify(original)
          if (oc && oc.kind !== want) {
            return Promise.resolve(vscode.window.tabGroups.close(original)).catch(() => {})
          }
        },
        () => {}
      )
      .then(release, release)
  }

  const syncOpenTabs = () => {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) handle(tab, true)
    }
  }

  const changeSub = vscode.window.tabGroups.onDidChangeTabs((e) => {
    e.closed.forEach((tab) => {
      const pending = pendingKeepChecks.get(tab)
      if (pending) clearTimeout(pending)
      pendingKeepChecks.delete(tab)
      const c = classify(tab)
      if (c) {
        lastKind.delete(keyOf(tab, c))
        recentNavigation.delete(c.uri.toString())
      }
    })
    e.opened.forEach((t) => handle(t, true))
    e.changed.forEach((t) => handle(t, false))
  })

  const initTimer = setTimeout(syncOpenTabs, 0)
  return new vscode.Disposable(() => {
    clearTimeout(initTimer)
    pendingKeepChecks.forEach((timer) => clearTimeout(timer))
    pendingKeepChecks.clear()
    changeSub.dispose()
    selectionSub.dispose()
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

  const keepProvider = KeepEditorProvider.register(context)

  context.subscriptions.push(
    keepProvider,
    watchTabsForKeep(context, suppressed, keepProvider),
    vscode.commands.registerCommand('easymarkdown.openWithKeep', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      if (isMarkdownFileUri(uri)) {
        await context.globalState.update(MODE_KEY, 'keep')
        holdSuppress(uri)
        await vscode.commands.executeCommand('vscode.openWith', uri, KEEP_VIEW_TYPE)
      }
    }),
    vscode.commands.registerCommand('easymarkdown.openWithText', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      // 'default' reopens with VSCode's built-in text editor (source mode), and
      // source becomes the preferred mode for the next file.
      if (isMarkdownFileUri(uri)) {
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
      if (isMarkdownFileUri(uri)) {
        holdSuppress(uri)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          KEEP_VIEW_TYPE,
          vscode.ViewColumn.Beside
        )
      }
    }),
    vscode.commands.registerCommand('easymarkdown.attachFile', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      if (isMarkdownFileUri(uri)) await keepProvider.attachFiles(uri)
    }),
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, keepCodeLensProvider)
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
