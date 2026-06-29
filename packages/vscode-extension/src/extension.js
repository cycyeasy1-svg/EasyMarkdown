const vscode = require('vscode')
const { KeepEditorProvider } = require('./keepEditorProvider')

function activate(context) {
  context.subscriptions.push(KeepEditorProvider.register(context))
}

function deactivate() {}

module.exports = { activate, deactivate }
