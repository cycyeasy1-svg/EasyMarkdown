# Changelog

## 1.3.0

- **Keep mode is now the default editor for Markdown** — opening a `.md` file
  lands directly in the keep view; the Source button / `Ctrl+Shift+M` switches
  back, and that explicit choice is remembered for new files (both directions,
  `easymarkdown.keep.rememberMode`).
- **Fix: clicking an already-open keep file in the Explorer flipped it back to
  source** — VSCode replaces the tab's editor in place, which surfaces as a
  `changed` tab event the mode watcher didn't handle.
- **Fix: Find (Ctrl/Cmd+F) crashed** — the webview still called the app's find
  helpers with their pre-overhaul signature; every search threw a TypeError.
- **GFM task lists** — `- [ ]` / `- [x]` render as real checkboxes; clicking one
  toggles exactly that source line (zero-diff, one line in the undo history).
- **YAML frontmatter** — a `---` block at the top of the file renders as a
  metadata card (flat `key: value` → definition grid, complex YAML → code box)
  instead of being mis-parsed as a rule + paragraph. Editable via the block's
  pencil button like any other block.
- **Image paste & drag-drop** — paste an image (or drop a file) to save it into
  `./assets/` next to the document and insert a relative markdown link.
- **Relative links & anchors** — `#heading` links jump within the document;
  relative `.md`/file links open in VSCode (honoring your preferred keep/source
  mode); `file.md#section` opens and scrolls.
- **Scroll sync** — "Open Keep View to the Side" now keeps the keep view and the
  source editor scroll-locked (both directions; `easymarkdown.keep.scrollSync`
  to disable).
- **Find & replace** — the find bar gains a replace row (replace one / replace
  all), operating on source lines so replacements stay zero-diff.
- Internal: the webview now bundles the app's i18n table and mermaid render core
  directly instead of hand-synced copies (the root cause of the find crash).

## 1.2.2

- Fixed floating-button positioning; declared explicit `activationEvents`.

## 1.2.0

- Modernized keep mode: Excel-style table column filters, heading fold,
  in-editor outline navigator, settings panel (theme / language / layout),
  mermaid & KaTeX zoom lightbox, wide-table floating header.

## 1.0.0

- Initial release: keep mode (zero-diff, source-backed markdown editing) as a
  VSCode custom editor — table cell/row/column editing, rich copy, relative
  images, live external-edit sync, VSCode-owned dirty/undo/save.
