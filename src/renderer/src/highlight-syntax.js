// `==highlight==` — the syntax rules, shared by BOTH renderers.
//
// Highlight is NOT in CommonMark and NOT in GFM; there is no spec to point at.
// It's a de-facto extension (Typora, Obsidian, markdown-it-mark), so its exact
// edge cases are a local decision — and that decision has to live in exactly one
// place, or the two editors disagree on what a document means:
//   • editor-highlight.js — Milkdown / remark (rich mode)
//   • keep-parser.js      — markdown-it (keep mode, VSCode webview, PDF export)
//
// This module MUST stay Milkdown-free: keep-parser.js is bundled verbatim into
// the VSCode extension's webview, which has no ProseMirror. (Same constraint and
// same shape as editor-mermaid-core.js.)

export const HIGHLIGHT_COLORS = ['yellow', 'red', 'blue']

// Match ==text== without tripping on `===` / `a = b`:
//   - not adjacent to another `=` (so `===` / a trailing `=` are out)
//   - `==}` cannot open a highlight; that sequence closes source-readable review
//     markup: `{==text==}{>>comment<<}`.
//   - content non-empty, no `=`, no leading/trailing whitespace
// CJK has no word boundaries, so we don't require whitespace around the `==`
// (Typora behaves the same): `这是==高亮==的` works.
const HIGHLIGHT_PATTERN = '(?<![={])(==)(?!\\})([^=\\s][^=]*[^=\\s]|[^=\\s])\\1(?![=])'

// Scanning form, for remark's findAndReplace over a whole text node.
export const HIGHLIGHT_RE = new RegExp(HIGHLIGHT_PATTERN, 'g')
// Anchored form, for markdown-it's inline ruler (probe at exactly `state.pos`).
// Sticky + lookbehind still sees the characters before `lastIndex`, so the
// `(?<![={])` guard keeps working. Callers set `.lastIndex` before every exec.
export const HIGHLIGHT_STICKY_RE = new RegExp(HIGHLIGHT_PATTERN, 'y')

// A complete `<mark class="hm-hl-COLOR">…</mark>` fragment — what the rich
// editor stringifies a red/blue highlight to (yellow round-trips as `==text==`).
// Anchored: testing one coalesced run of inline-HTML nodes (remark).
export const MARK_HTML_RE = /^<mark\s+class="hm-hl-(yellow|red|blue)"\s*>([\s\S]*?)<\/mark>$/
// Sticky: probing at exactly `state.pos` from markdown-it's inline ruler (keep mode).
export const MARK_HTML_STICKY_RE = /<mark\s+class="hm-hl-(yellow|red|blue)"\s*>([\s\S]*?)<\/mark>/y

export function colorFromClass(cls) {
  for (const c of HIGHLIGHT_COLORS) if ((' ' + cls + ' ').includes(' hm-hl-' + c + ' ')) return c
  return 'yellow'
}
