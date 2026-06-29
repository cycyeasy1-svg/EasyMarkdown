# EasyMarkdown Keep (VSCode extension)

A VSCode port of [EasyMarkdown](../../)'s **keep mode** — a source-backed live
preview that lets you edit Markdown inline (tables, block source, Excel-style
column filters) while keeping the file's bytes intact everywhere you didn't
touch (**zero diff**). Built for Git-tracked spec documents.

The `TextDocument` is the single source of truth: every edit is applied as a
minimal line-range `WorkspaceEdit`, so VSCode owns dirty state, undo/redo and
save.

## How it works

- Registered as an **optional** custom editor (`priority: "option"`) for
  `*.md` / `*.markdown`. Open a file, then **Reopen Editor With… → EasyMarkdown
  Keep** (or set it as your default for Markdown).
- The core parser/renderer is **shared** with the desktop app by direct import
  (`src/renderer/src/keep-parser.js`, `editor-images.js`, `editor-copy.js`) — no
  copy, single source of truth. Only the Mermaid render helpers and a small i18n
  subset are kept local (to avoid pulling Milkdown / React into the bundle); these
  are flagged for later de-duplication.

## Develop

```bash
cd packages/vscode-extension
npm install
npm run build        # esbuild → dist/extension.cjs + dist/webview.js + dist/webview.css
# then press F5 in VSCode (Run Extension) to launch an Extension Development Host
```

`npm run watch` rebuilds on change.

## MVP scope

Render · table cell edit · block source edit · table add/remove rows & columns ·
Excel-style column filter · relative images · Mermaid / KaTeX · undo-redo &
external-change sync.

Deferred: PDF export, outline (DocumentSymbolProvider), in-document link
navigation, "open source here", pasted-image persistence.

## Isolation

This package is fully self-contained: it has its own `package.json` / build and
is **not** part of the desktop app's build, root `package.json`, or test runs.
Building or running it does not affect the EasyMarkdown app.
