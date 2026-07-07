# EasyMarkdown

[![CI](https://github.com/cycyeasy1-svg/EasyMarkdown/actions/workflows/ci.yml/badge.svg)](https://github.com/cycyeasy1-svg/EasyMarkdown/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cycyeasy1-svg/EasyMarkdown?include_prereleases)](https://github.com/cycyeasy1-svg/EasyMarkdown/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**English** · [简体中文](./README.md)

A calm, modern **Markdown editor**: a file tree holds your whole folder, every
document is a tab in the same window, and you write in either a clean WYSIWYG
canvas or EasyMarkdown's signature **keep mode** — rendering is just a view, and
saving produces a **zero-diff** result that never reflows your original text.

> 📜 **About this project**: EasyMarkdown is a **derivative work** based on the
> open-source project [horseMD](https://github.com/BND-1/horseMD) (by Evan Yang
> / 杨庭毅, MIT licensed). On top of its single-window / multi-tab / WYSIWYG
> foundation, this project adds **keep mode (zero-diff editing)**, a **VS Code
> extension**, **Japanese typography support**, **workspace-wide full-text
> search**, and more — see
> "[What's new compared to the original](#-whats-new-compared-to-the-original-project)"
> below. The original copyright and attribution are preserved in
> [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md), as the MIT License requires.

![EasyMarkdown — folder workspace, tabs, and live WYSIWYG rendering](./docs/screenshots/hero_light.png)

## Why EasyMarkdown

Most Markdown editors make you choose twice: a beautiful WYSIWYG canvas *or* a
real multi-file workflow; a smooth editing experience *or* a file that keeps its
original formatting. EasyMarkdown refuses both trade-offs: a **single window**
holds your whole folder in a file tree with every document in a **tab**; the
rich-text mode is an in-place live-preview editor powered by
[Milkdown](https://milkdown.dev/) (ProseMirror), while **keep mode** treats your
original text as the source of truth and saves with zero diff. It runs on
**Windows and macOS** from one codebase, and the interface speaks **English,
中文, and 日本語**.

## ✨ What's new compared to the original project

The following was developed independently in EasyMarkdown on top of horseMD —
it's what sets the two projects apart:

**Keep mode — a source-faithful, zero-diff editor (the default for `.md`)**

- WYSIWYG engines (Typora, Milkdown, …) **rewrite your whole file** on save:
  list indentation, blank lines, escapes, and table alignment can all get
  reflowed. Keep mode inverts that: rendering is just a view — **your original
  text is the source of truth, and saving is zero-diff**. Ideal for documents
  under Git or shared with collaborators
- Block-level **in-place editing** — click a block to edit its content, or
  "open source here" to edit just that block's Markdown
- **Heavily enhanced tables** — column filters (value search / select all /
  per-table badges / one-click clear for a table or the whole document),
  row & column insert/delete, copy by cell / row / column / table, floating
  header for wide tables
- **Heading folding**, GFM task lists, YAML frontmatter rendered as a
  structured card
- One-click **keep ⇄ Milkdown** toggle in the status bar, remembered per
  document; Mermaid diagrams share a render cache across both modes

**VS Code extension** ([`packages/vscode-extension`](./packages/vscode-extension))

- Brings keep mode into VS Code as a Markdown editor: image paste, links,
  scroll sync with the source, find & replace, table column filters, heading
  folding, and an outline

**Japanese typography**

- UI and native menus in **English / 中文 / 日本語** (the original is bilingual)
- Documents containing kana automatically switch to a **Japanese font stack**,
  so kanji render with Japanese glyph forms — in the editor, keep mode,
  PDF / HTML export, and print

**Workspace & engineering**

- **Workspace full-text search** (`Ctrl/Cmd+Shift+F`) — across files, grouped
  per file, streaming in as found
- **Multi-root workspaces** — mount several folders at once
- **Source-mode line numbers & folding**, loading skeleton for large documents
- A batch of UX work: autosave, tab pinning, system print, HTML export, a
  unified settings panel
- Large-document performance work (render throttling, faster startup, lag-free
  typing) plus a full engineering baseline: ESLint, vitest unit tests, and
  Playwright E2E

## Features

**Editing — everything Typora has**

- Seamless **WYSIWYG live preview** — type Markdown, see it render in place
- Slash menu (`/`) for inserting blocks; smart lists, selection toolbar, link tooltips
- Tables (**with in-cell line breaks**), fenced **code blocks with syntax highlighting**, **LaTeX math**, **Mermaid diagrams**, images, task lists, blockquotes
- **Pasted images persist locally** — paste / drop / upload an image and it's written into the document's `assets/` folder with a relative path (Typora-style); nothing dies on reload
- **Source mode** toggle (`Ctrl/Cmd+/`) for raw Markdown — keeps scroll position
- **Plain-text files (`.txt`) open in a fast plain editor** — no markdown reflow, instant on huge files
- Rich-text copy with inline styles (paste into WeChat / email / Notion keeps formatting)
- **Export to PDF** (`Ctrl/Cmd+Shift+E`) — clean print layout, no editor chrome
- **Export to HTML** (`Ctrl/Cmd+Shift+H`) — a self-contained single file (local images inlined) that survives mailing / moving
- **System print** (`Ctrl/Cmd+Alt+P`) — the same clean layout straight to the native print dialog
- **Spellcheck** (opt-in, off by default) — toggle in Settings; right-click for suggestions / add to dictionary
- Relative-path images resolve against the file's folder (display only — your file stays untouched)
- **Double-click an image to view it enlarged** in a lightbox (Esc / click to close)
- **Raw HTML tables** (`<table>…</table>` in the Markdown) render as real tables, like Typora — display only, the source is preserved
- A floating **block-level badge** tracks the caret (H1…H6 / Text)

**Beyond Typora**

- **Tabs** — many files in one window (`Ctrl/Cmd+Tab` to cycle); a `+` in the top bar for a new doc; **drag to reorder, right-click to pin** (pinned tabs sit left, survive "Close Others" and restarts); right-click a tab to copy its path / name, reveal it in Finder/Explorer, or close others
- **Split view** — two documents side by side, both editable (right-click a tab → "Open in Split", or the split button in the top bar; close with the ✕ on the right pane)
- **Adjustable editor width** — status-bar presets (Narrow/Medium/Wide/Full) + a fine-tune slider
- **Custom themes** — drop a `.css` into the themes folder; **Typora themes work directly**
- **Unsaved scratch tabs survive a restart** — a new, never-saved doc is still there next time you open EasyMarkdown
- **Folder workspace** — a file tree with create / rename / duplicate / delete / reveal / export-PDF, plus **drag-and-drop to move** and expand-all / collapse-all
- **Open in the same window** — double-clicking a file in Finder/Explorer adds a tab; "Open with EasyMarkdown" on a folder opens it as a workspace
- **Command palette** (`Ctrl/Cmd+P`) — fuzzy-jump to any file or command
- **Workspace full-text search** (`Ctrl/Cmd+Shift+F`) — search across files with per-file grouping, highlighted hits streaming in as they're found; click to jump to the exact line (case / whole-word / regex)
- **Find & replace in file** (`Ctrl/Cmd+F` / `Ctrl+H`, macOS `⌥⌘F` for replace) — live match highlighting and count, replace one / replace all (case / whole-word / regex apply too)
- **Outline panel** (`Ctrl+Shift+L`) — click a heading to jump
- Live word / character count & reading time
- Session restore — reopens your folder and tabs
- Auto-refreshing file tree & open files — watches for external changes
- **Home button** in the activity bar — back to the welcome page anytime (open tabs stay loaded)
- **Unified Settings** (`Ctrl/Cmd+,`, status-bar gear, or command palette) — typography, appearance, language and editing preferences in one place
- **Autosave** (opt-in, off by default) — saved files write to disk ~2 s after you stop typing; never clobbers an unresolved external edit
- **Choosable default editor** — new Markdown tabs open in keep mode or WYSIWYG, your pick in Settings
- **Manageable recent files** — pin to top, remove one, or clear the list on the welcome page
- **Localized application menu** — the native menu follows the UI language (EN / 中文 / 日本語)
- **Loading skeleton** for large documents, so opening a big file isn't a blank pause
- Unsaved-changes warning when closing the window or quitting (not just closing a tab)
- Notify-only update check — tells you when a new release is out **and shows what changed** (no auto-download)

Command palette — fuzzy-jump to any file or command:

![Command palette](./docs/screenshots/command_palette.png)

## Themes

Six polished themes — warm light/dark plus four muted **Morandi** palettes —
switchable with `Ctrl+Shift+T` or the status-bar picker.

| Warm Light | Warm Dark | Morandi Dusk |
| :---: | :---: | :---: |
| ![Warm Light](./docs/screenshots/hero_light.png) | ![Warm Dark](./docs/screenshots/theme_dark.png) | ![Morandi Dusk](./docs/screenshots/theme_morandi_dusk.png) |
| **Morandi Sage** | **Morandi Rose** | **Morandi Mist** |
| ![Morandi Sage](./docs/screenshots/theme_morandi_sage.png) | ![Morandi Rose](./docs/screenshots/theme_morandi_rose.png) | ![Morandi Mist](./docs/screenshots/theme_morandi_mist.png) |

## Keyboard shortcuts

| Action             | Shortcut                      |
| ------------------ | ----------------------------- |
| New file           | `Ctrl/Cmd+N`                  |
| Open file          | `Ctrl/Cmd+O`                  |
| Open folder        | `Ctrl/Cmd+Shift+O`            |
| Save / Save As     | `Ctrl/Cmd+S` / `…+Shift+S`    |
| Export as PDF      | `Ctrl/Cmd+Shift+E`            |
| Export as HTML     | `Ctrl/Cmd+Shift+H`            |
| Print              | `Ctrl/Cmd+Alt+P`              |
| Settings           | `Ctrl/Cmd+,`                  |
| Close tab          | `Ctrl/Cmd+W`                  |
| Command palette    | `Ctrl/Cmd+P`                  |
| Find in file       | `Ctrl/Cmd+F`                  |
| Find & replace     | `Ctrl+H` (macOS `⌥⌘F`)        |
| Search in workspace | `Ctrl/Cmd+Shift+F`           |
| Toggle sidebar     | `Ctrl/Cmd+B`                  |
| Toggle outline     | `Ctrl+Shift+L`                |
| Toggle source mode | `Ctrl/Cmd+/`                  |
| Toggle theme       | `Ctrl+Shift+T`                |
| Cycle tabs         | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

## Install

Grab the latest installer from the [**Releases page**](https://github.com/cycyeasy1-svg/EasyMarkdown/releases/latest).

> ℹ️ Builds aren't code-signed yet, so Windows / macOS will warn on first launch — it's **not malware and not actually damaged**. Follow the steps below to allow it. The source is fully open; build it yourself if you prefer.

### 🍎 macOS (step by step)

1. Check your chip: **Apple menu → "About This Mac"**:
   - **"Apple M1 / M2 / M3…"** (Apple Silicon) → download **`EasyMarkdown-x.x.x-arm64.dmg`**.
   - **"Intel"** → download **`EasyMarkdown-x.x.x.dmg`** (the one without the `-arm64` suffix).
2. Double-click the `.dmg` and **drag the EasyMarkdown icon into the Applications folder**.
3. **First launch** (important): double-clicking usually shows **"damaged and can't be opened"** or **"can't verify the developer"** — that's just the missing signature. Use either:

   - **Option A (easiest, recommended)**: in Finder → **Applications**, **Control-click (or right-click) EasyMarkdown → Open**, then click **Open** in the dialog. After this it opens normally by double-click.
   - **Option B (if A still says "damaged")**: open **Terminal** (Launchpad → Other → Terminal), paste this line and press Return:

     ```bash
     xattr -cr /Applications/EasyMarkdown.app
     ```

     then double-click EasyMarkdown again.

> You only need to do this **once per Mac**; updates generally won't require it again.

### 🪟 Windows

1. Download **`EasyMarkdown-Setup-x.x.x.exe`** and run it.
2. If a blue **SmartScreen** "Windows protected your PC" prompt appears, click **More info → Run anyway**.
3. Follow the installer (you can choose the install folder), then launch from Start menu / desktop.

> Signing & notarization are planned — see the [CHANGELOG](./CHANGELOG.md).

## Feedback & support

- 🐛 **Bugs / feature requests**: [GitHub Issues](https://github.com/cycyeasy1-svg/EasyMarkdown/issues) — see [SUPPORT.md](./SUPPORT.md) for what to include
- 🔒 **Security issues**: please don't open a public issue — report privately via [SECURITY.md](./SECURITY.md)
- ⭐ If EasyMarkdown works well for you, a star is the best support

## Develop

```bash
npm install        # if Electron's binary download is blocked, set a mirror first:
                   #   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev        # hot-reload dev mode
npm run build      # bundle main + preload + renderer into out/
npm start          # run the built app
npm run dist       # package for the host OS (Windows NSIS / macOS dmg+zip)
```

Working in this repo with an AI agent? Start from [CLAUDE.md](./CLAUDE.md).

## Tech

Electron + Vite + React shell, with **Milkdown Crepe** (ProseMirror) as the
editor engine. The shell — tabs, file tree, command palette, outline, theming,
i18n — is custom. See [`docs/`](./docs/README.md) for architecture, feature
implementation, and the bugs/decisions log.

## Docs

- [ROADMAP.md](./ROADMAP.md) — shipped / near-term / longer-term (incl. Android & iOS mobile)
- [docs/architecture.md](./docs/architecture.md) — tech stack, process model, structure, data flow
- [docs/features.md](./docs/features.md) — how each feature works (mapped to files)
- [docs/implementation-notes.md](./docs/implementation-notes.md) — root causes of key bugs, design decisions
- [docs/development.md](./docs/development.md) — develop, build, Windows/macOS packaging, CDP e2e tests
- [docs/release.md](./docs/release.md) — release checklist
- [PRIVACY.md](./PRIVACY.md) / [SUPPORT.md](./SUPPORT.md) / [NOTICE.md](./NOTICE.md)

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Found a
security problem? Please report it privately via [SECURITY.md](./SECURITY.md).

## License & acknowledgements

[MIT](./LICENSE) © Easy Chen.

EasyMarkdown is derived from the open-source project
[BND-1/horseMD](https://github.com/BND-1/horseMD) (© 杨庭毅 / Evan Yang, MIT
licensed) — many thanks to the original author for the excellent groundwork. As
the MIT License requires, the original copyright and license notice are fully
preserved in [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md), and the in-app
About area retains the original author's credit.
