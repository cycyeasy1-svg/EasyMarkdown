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
- **Task lists** — `- [ ]` / `- [x]` render as real checkboxes; a click toggles
  exactly that source line.
- **YAML frontmatter** — the `---` block at the top renders as a metadata card,
  editable like any other block.
- **Image paste & drop** — paste a screenshot (or drop an image file) to save it
  into `./assets/` next to the document and insert a relative link, Typora-style.
- **Links** — `#anchors` jump within the document; relative `.md`/file links open
  in VSCode (`file.md#section` opens *and* scrolls).
- **Heading fold** — collapse/expand a heading's whole section.
- **Outline** — a heading navigator; jump to any heading (auto-expands folded
  sections).
- **Find & replace** — `Ctrl+F` / `Cmd+F` in-document search with match count and
  next/prev; the chevron opens a replace row (replace one / all, source-based and
  zero-diff).
- **Scroll sync** — "Open Keep View to the Side" keeps the keep view and the
  source editor scroll-locked both ways (`easymarkdown.keep.scrollSync`).
- **Settings** (the gear button) — color **theme** (follow VSCode, or the built-in
  Warm Light / Warm Dark), UI **language** (follow system, or 中文 / 日本語 /
  English), and **layout** (page width, font size, zoom, line height, paragraph
  spacing).
- **Mermaid & KaTeX** — click a diagram's magnifier to open a zoom lightbox
  (wheel to zoom, drag to pan) so dense diagrams stay legible.
- Relative images, live sync with external edits and undo/redo.

## Getting started

Keep mode is the **default editor** for Markdown — opening a `.md` file (from
the Explorer, quick open, links, …) lands directly in the rendered keep view.

- To edit the raw source, click the **Source** button (top right) or press
  `Ctrl+Shift+M` (`Cmd+Shift+M` on macOS). That choice is remembered: new files
  open as source until you switch back (📖 CodeLens / title-bar book icon /
  `Ctrl+Shift+M`). Turn the memory off with `easymarkdown.keep.rememberMode`.
- **Open Keep View to the Side** (right-click / title bar) splits keep beside
  the source; both bind to the same document and stay scroll- and edit-synced.

Inside the keep editor, the top-right buttons are **Source** (back to text),
**Outline**, and **Settings** (theme / language / layout). Press `Ctrl+F`
(`Cmd+F`) to search within the document.

> **Updating the extension**: with keep editors open, the Extensions view's
> "Restart Extensions" button warns and may fail — VSCode cannot restart the
> extension host while it owns live custom-editor webviews. Use **Reload
> Window** (`Ctrl+Shift+P` → "Reload Window") instead; open keep tabs are
> restored automatically.

## Requirements

VSCode 1.84 or newer.

## License

MIT © Easy Chen
