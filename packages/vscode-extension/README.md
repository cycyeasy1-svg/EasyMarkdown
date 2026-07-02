# EasyMarkdown

A source-backed **live preview + inline editing** editor for Markdown — edit
tables, block source, headings and more directly in the rendered view, while the
file's bytes stay untouched everywhere you didn't edit (**zero diff**). Built for
Git-tracked spec documents. This is the VSCode edition of EasyMarkdown's "keep
mode".

The `TextDocument` is the single source of truth: every edit is applied as a
minimal line-range edit, so VSCode owns dirty state, undo/redo and save.

## Features

- **Zero-diff inline editing** — double-click a table cell or block to edit its
  source; only the touched lines are rewritten.
- **Tables** — Excel-style per-column filters, add/remove rows & columns, a
  sticky floating header for wide tables, rich copy (cell / row / column / table).
- **Heading fold** — collapse/expand a heading's whole section.
- **Outline** — a heading navigator; jump to any heading (auto-expands folded
  sections).
- **Find** — `Ctrl+F` / `Cmd+F` in-document search with match count and next/prev.
- **Settings** (the gear button) — color **theme** (follow VSCode, or the built-in
  Warm Light / Warm Dark), UI **language** (follow system, or 中文 / 日本語 /
  English), and **layout** (page width, font size, zoom, line height, paragraph
  spacing).
- **Mermaid & KaTeX** — click a diagram's magnifier to open a zoom lightbox
  (wheel to zoom, drag to pan) so dense diagrams stay legible.
- Relative images, live sync with external edits and undo/redo.

## Getting started

The editor is registered as an **optional** editor for Markdown (it does not take
over your default editor). Open a `.md` file, then switch in any of these ways:

- Click **📖 Open in Keep Mode** (the CodeLens at the top of the file), or the
  book icon in the editor title bar.
- Right-click in the editor → **Open in Keep Mode** or **Open Keep View to the
  Side** (split beside the source).
- Press `Ctrl+Shift+M` (`Cmd+Shift+M` on macOS) to toggle.

Inside the keep editor, the top-right buttons are **Source** (back to text),
**Outline**, and **Settings** (theme / language / layout). Press `Ctrl+F`
(`Cmd+F`) to search within the document.

## Requirements

VSCode 1.84 or newer.

## License

MIT © Easy Chen
