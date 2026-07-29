// Raw-HTML rendering for Milkdown's `html` node + block-type conversion.

import {
  isRenderableBlockHtml,
  isRenderableInlineHtml,
  sanitizeHtmlFragment
} from '../html-sanitize.js'

// Decode HTML entities (&nbsp;, &amp;, &#160;…) to their characters for *display*
// of raw HTML we don't render. A <textarea> is a rawtext element: assigning
// innerHTML decodes entities but never parses the tags as markup (so no script
// runs and the tags stay literal). Used only for the read-only fallback span;
// the node still round-trips through attrs.value, so the saved Markdown keeps the
// original entities.
function decodeEntities(s) {
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}

// ProseMirror node view for Milkdown's `html` node. Renders recognized block HTML
// as a real DOM block, balanced inline fragments inline, and leaves anything else
// as entity-decoded source text.
export function renderHtmlNodeView(node) {
  const value = node.attrs?.value || ''
  if (isRenderableBlockHtml(value)) {
    const dom = document.createElement('div')
    dom.className = 'hm-html-block'
    dom.setAttribute('data-type', 'html')
    dom.contentEditable = 'false'
    dom.innerHTML = sanitizeHtmlFragment(value)
    // The node is an atom with no editable content; ignore inner DOM mutations so
    // ProseMirror doesn't try to reconcile the rendered HTML.
    return { dom, ignoreMutation: () => true, stopEvent: () => false }
  }
  // Balanced inline fragment (merged into one node, so it carries a close tag) →
  // render inline. Without a close tag it's a lone open tag we couldn't pair, so
  // fall through to text rather than emit an empty element.
  if (isRenderableInlineHtml(value)) {
    const span = document.createElement('span')
    span.className = 'hm-html-inline'
    span.setAttribute('data-type', 'html')
    span.contentEditable = 'false'
    span.innerHTML = sanitizeHtmlFragment(value)
    return { dom: span, ignoreMutation: () => true, stopEvent: () => false }
  }
  // Not something we render — show the raw markup as text, but decode HTML
  // entities first so a `&nbsp;` reads as a space (not literal "&nbsp;") and
  // `&amp;` as "&". Display-only; the node keeps its original attrs.value.
  const span = document.createElement('span')
  span.setAttribute('data-type', 'html')
  span.textContent = decodeEntities(value)
  return { dom: span, ignoreMutation: () => true }
}

// ── Merge inline HTML pairs at parse time (remark transform) ──
// Milkdown parses inline HTML into separate open/close `html` nodes
// (`<b>` · `bold` · `</b>`), so a per-node view can never pair them — a lone
// `<b>` would render as an empty element. This transform finds a *balanced*
// `<tag …>…</tag>` run inside phrasing content whose inner nodes are all simple
// (text / <br> / raw html) and collapses it into ONE `html` node whose value is
// the full fragment. The node view then renders that inline, and it round-trips:
// the node serializes back to exactly this value. Runs with complex inner content
// (nested emphasis, links, images) are left split — lossless beats clever.
const INLINE_HTML_TAGS = new Set([
  'span', 'font', 'b', 'i', 'u', 's', 'strike', 'em', 'strong', 'small', 'big',
  'sub', 'sup', 'mark', 'kbd', 'abbr', 'ins', 'del', 'cite', 'q', 'samp', 'var', 'time'
])
const OPEN_TAG_RE = /^<([a-z][a-z0-9]*)(\s[^>]*)?>$/i // <tag> / <tag attrs>, not self-closing
const CLOSE_TAG_RE = /^<\/([a-z][a-z0-9]*)\s*>$/i
const PHRASING_PARENTS = new Set([
  'paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link'
])

function escTextForHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// Serialize a simple inner node back to an HTML string, or null if it's a kind we
// won't reconstruct (so the caller leaves the run unmerged).
function serializeInner(n) {
  if (!n) return ''
  if (n.type === 'text') return escTextForHtml(n.value || '')
  if (n.type === 'break') return '<br>'
  if (n.type === 'html') return n.value || ''
  return null
}

export function mergeInlineHtmlRemarkPlugin() {
  return (tree) => {
    const visit = (node) => {
      if (!node || !Array.isArray(node.children)) return
      node.children.forEach(visit)
      if (!PHRASING_PARENTS.has(node.type)) return
      const kids = node.children
      const out = []
      let i = 0
      while (i < kids.length) {
        const k = kids[i]
        const open = k && k.type === 'html' ? (k.value || '').trim().match(OPEN_TAG_RE) : null
        const tag = open && open[1].toLowerCase()
        if (open && INLINE_HTML_TAGS.has(tag)) {
          // Scan forward to the matching close tag, tracking nested same-tag pairs.
          let depth = 1
          let j = i + 1
          const inner = []
          for (; j < kids.length; j++) {
            const c = kids[j]
            if (c && c.type === 'html') {
              const v = (c.value || '').trim()
              if (OPEN_TAG_RE.test(v) && v.match(OPEN_TAG_RE)[1].toLowerCase() === tag) depth++
              else if (CLOSE_TAG_RE.test(v) && v.match(CLOSE_TAG_RE)[1].toLowerCase() === tag) {
                depth--
                if (depth === 0) break
              }
            }
            inner.push(c)
          }
          if (depth === 0 && j < kids.length) {
            const pieces = inner.map(serializeInner)
            if (pieces.every((p) => p !== null)) {
              out.push({ type: 'html', value: k.value + pieces.join('') + kids[j].value })
              i = j + 1
              continue
            }
          }
        }
        out.push(k)
        i++
      }
      node.children = out
    }
    visit(tree)
  }
}

// Convert the block containing the cursor to a different type. Operates on the
// textblock the selection actually sits in and commits through the view so
// ProseMirror's state stays in sync.
export function convertBlock(view, typeName, attrs = {}) {
  const { state } = view
  const { schema, selection } = state
  const { $from } = selection

  const targetType = schema.nodes[typeName]
  if (!targetType) return

  let depth = $from.depth
  while (depth > 0 && !$from.node(depth).isTextblock) depth--
  const node = depth >= 0 ? $from.node(depth) : null
  if (!node) return

  // No-op if it's already exactly what we'd convert to.
  if (node.type.name === typeName) {
    if (typeName === 'heading' && node.attrs.level === attrs.level) return
    if (typeName === 'paragraph') return
  }

  const pos = $from.before(depth)
  view.dispatch(state.tr.setNodeMarkup(pos, targetType, attrs))
}
