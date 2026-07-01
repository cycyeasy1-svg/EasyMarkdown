const vscode = require('vscode')
const { KeepEditorProvider } = require('./keepEditorProvider')

const KEEP_VIEW_TYPE = 'easymarkdown.keep'

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

function activate(context) {
  context.subscriptions.push(
    KeepEditorProvider.register(context),
    vscode.commands.registerCommand('easymarkdown.openWithKeep', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, KEEP_VIEW_TYPE)
    }),
    vscode.commands.registerCommand('easymarkdown.openWithText', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      // 'default' reopens with VSCode's built-in text editor (source mode).
      if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, 'default')
    }),
    vscode.commands.registerCommand('easymarkdown.openKeepToSide', async (uriArg) => {
      const uri = activeResourceUri(uriArg)
      // Open the keep editor in a split beside the source — both bind to the same
      // TextDocument, so edits on either side stay live-synced (zero-diff).
      if (uri)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          KEEP_VIEW_TYPE,
          vscode.ViewColumn.Beside
        )
    }),
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, keepCodeLensProvider)
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
