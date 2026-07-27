// Display-math normalization for the rich (Milkdown) editor.
//
// Milkdown's LaTeX feature only recognizes block math when the `$$` fences sit
// on their own lines, so a single-line `$$x^2$$` (common in files written by
// hand or by other editors) renders as literal text. Before feeding a document
// to Crepe we expand such lines into the three-line block form. Fenced code
// blocks and YAML front matter are left untouched — a code block may
// legitimately contain `$$…$$` lines (e.g. docs about math syntax).
//
// Pure string → string; covered by unit tests in test/editor-math.test.js.

// A line that is exactly one display formula: up to 3 leading spaces (4+ is an
// indented code block), `$$`, non-empty content without further `$$`, `$$`.
const SINGLE_LINE_MATH_RE = /^( {0,3})\$\$([^$](?:[^$]|\$(?!\$))*?)\$\$\s*$/

// Opening/closing code fence (``` or ~~~), up to 3 leading spaces.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

export function normalizeDisplayMath(md) {
  if (!md || md.indexOf('$$') === -1) return md
  const lines = md.split('\n')
  const out = []
  let i = 0

  // Skip YAML front matter at the very top (--- … --- / ...).
  if (lines[0]?.trimEnd() === '---') {
    out.push(lines[0])
    i = 1
    while (i < lines.length) {
      const t = lines[i].trimEnd()
      out.push(lines[i])
      i++
      if (t === '---' || t === '...') break
    }
  }

  let fence = null // { char, len } while inside a fenced code block
  let changed = false
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (fence) {
      out.push(line)
      const m = line.match(FENCE_RE)
      if (m && m[1][0] === fence.char && m[1].length >= fence.len) fence = null
      continue
    }
    const open = line.match(FENCE_RE)
    if (open) {
      out.push(line)
      fence = { char: open[1][0], len: open[1].length }
      continue
    }
    const math = line.match(SINGLE_LINE_MATH_RE)
    if (math && math[2].trim()) {
      const indent = math[1]
      out.push(indent + '$$', indent + math[2].trim(), indent + '$$')
      changed = true
      continue
    }
    out.push(line)
  }
  return changed ? out.join('\n') : md
}

const TYPING_KEY = new PluginKey('hm-math-block-typing')

// Prevent the inline-math input rule from consuming the first closing `$` of a
// typed `$$...$$` block. The complete run becomes a LaTeX code block, matching
// the representation used by pasted display math.
export function createMathBlockPromotionPlugin() {
  return new Plugin({
    key: TYPING_KEY,
    props: {
      handleTextInput(view, from, _to, text) {
        if (text !== '$') return false
        const $from = view.state.doc.resolve(from)
        if (!$from.parent.isTextblock) return false
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n')
        const full = before + '$'
        const blockMatch = full.match(/\$\$([^\n$]+)\$\$$/)
        if (blockMatch) {
          const codeType = view.state.schema.nodes.code_block
          if (!codeType) return false
          const content = blockMatch[1]
          const start = from - (blockMatch[0].length - 1)
          const node = codeType.create(
            { language: 'LaTeX' },
            content ? view.state.schema.text(content) : null
          )
          view.dispatch(
            view.state.tr
              .replaceWith(start, from, node)
              .setMeta('addToHistory', true)
          )
          return true
        }
        if (/\$\$([^\n$]+)\$$/.test(full)) {
          view.dispatch(view.state.tr.insertText('$', from))
          return true
        }
        return false
      }
    }
  })
}
import { Plugin, PluginKey } from '@milkdown/prose/state'
