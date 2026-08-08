// Smart paste for Markdown.
//
// Milkdown's default paste does NOT parse pasted Markdown source — pasting a doc
// with `#` headings / tables / blockquotes / `$$` math / ```fences / `---` front
// matter lands as flat text. This handler runs in the DOM CAPTURE phase (before
// ProseMirror's own paste handler, which would build a slice from text/html and
// bypass us), reads text/plain from the clipboard, and — when it clearly IS
// Markdown — runs it through Milkdown's own remark parser so it renders with full
// fidelity. Scoped triggers:
//   (1) raw mermaid code that starts with a diagram header → a mermaid block;
//   (2) any strong Markdown block marker → parse the whole clipboard as Markdown.
// Never takes over when pasting INTO a code block (append code there).
import { Slice, Fragment } from '@milkdown/prose/model'
import { startsAsMermaid } from './editor-mermaid.js'
import { codeBlockAtDom } from './editor-codeblock-source.js'

// Accept either a complete fenced Mermaid block or raw Mermaid source. Header
// detection is shared with the renderer so new diagram types stay in sync.
const fencedMermaid = (text) => {
  const normalized = String(text || '').replace(/\r\n?/g, '\n')
  const match = normalized.match(/^(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*?)\n\1[ \t]*$/i)
  return match ? match[2].replace(/\s+$/, '') : null
}

const mermaidBody = (text) => {
  const fenced = fencedMermaid(text)
  if (fenced !== null) return fenced
  return startsAsMermaid(text)
    ? String(text || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
    : null
}

function looksLikeMarkdown(text) {
  if (/^#{1,6}\s/m.test(text)) return true
  if (/^```/m.test(text)) return true
  if (/^>\s/m.test(text)) return true
  if (/^\|.*\|.*\n/m.test(text)) return true
  if (/^([-*+]\s|\d+\.\s)/m.test(text)) return true
  if (/\$\$/.test(text)) return true
  if (/^(\*\*\*|---)\s*$/m.test(text)) return true // hr / front-matter fence
  return false
}

// Attach a capture-phase paste listener on the editor DOM. Returns a cleanup fn.
export function attachMdPasteHandler(view, parse, canEdit = () => true) {
  const onPaste = (event) => {
    if (!canEdit()) return
    const text = event.clipboardData?.getData('text/plain') || ''
    if (!text) return
    const schema = view.state.schema
    const pastedMermaid = mermaidBody(text)
    const target = codeBlockAtDom(view, event.target.closest?.('.milkdown-code-block'))

    // A second Mermaid paste belongs beside the current diagram. Handling this
    // at the actual paste boundary avoids scanning labels for header-like text.
    if (
      pastedMermaid !== null &&
      target &&
      String(target.node.attrs.language || '').toLowerCase() === 'mermaid'
    ) {
      try {
        const node = schema.nodes.code_block.create(
          { language: 'mermaid' },
          pastedMermaid ? schema.text(pastedMermaid) : null
        )
        const tr = target.node.textContent.trim()
          ? view.state.tr.insert(target.pos + target.node.nodeSize, node)
          : view.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, node)
        view.dispatch(tr.scrollIntoView())
        event.preventDefault()
        event.stopImmediatePropagation()
      } catch {
        // Fall back to CodeMirror's normal paste if the node view is tearing down.
      }
      return
    }

    // Other code blocks keep normal CodeMirror paste semantics.
    if (target || view.state.selection.$from.parent.type.name === 'code_block') return

    let handled = false
    if (pastedMermaid !== null) {
      const node = schema.nodes.code_block.create(
        { language: 'mermaid' },
        pastedMermaid ? schema.text(pastedMermaid) : null
      )
      handled = insert(view, Fragment.from(node))
    } else if (looksLikeMarkdown(text)) {
      const doc = parse(text)
      if (doc && doc.content && doc.content.size > 0) {
        handled = insert(view, doc.content)
      }
    }

    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  // capture = true so we run BEFORE ProseMirror's own paste handler (which would
  // build a slice from text/html and skip us).
  view.dom.addEventListener('paste', onPaste, true)
  return () => view.dom.removeEventListener('paste', onPaste, true)
}

function insert(view, fragment) {
  try {
    const tr = view.state.tr.replaceSelection(new Slice(fragment, 0, 0))
    tr.scrollIntoView()
    view.dispatch(tr)
    return true
  } catch {
    return false
  }
}
