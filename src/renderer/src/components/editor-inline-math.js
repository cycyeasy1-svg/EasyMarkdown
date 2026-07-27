import { NodeSelection, Plugin, PluginKey } from '@milkdown/prose/state'

const INLINE_MATH_KEY = new PluginKey('hm-inline-math-editing')
const isEscaped = (text, index) => {
  let slashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashes += 1
  return slashes % 2 === 1
}

export function findInlineMathSpans(text) {
  const source = String(text || '')
  const spans = []
  for (let open = 0; open < source.length; open += 1) {
    if (source[open] !== '$' || isEscaped(source, open)) continue
    if (source[open - 1] === '$' || source[open + 1] === '$') continue
    for (let close = open + 1; close < source.length; close += 1) {
      if (source[close] === '\n') break
      if (source[close] !== '$' || isEscaped(source, close)) continue
      if (source[close - 1] === '$' || source[close + 1] === '$') continue
      if (close > open + 1) {
        spans.push({
          from: open,
          to: close + 1,
          value: source.slice(open + 1, close)
        })
      }
      open = close
      break
    }
  }
  return spans
}

export function inlineMathAtCaret(text, offset) {
  return findInlineMathSpans(text)
    .find((span) => offset > span.from && offset < span.to) || null
}

const textblockStream = (node) => {
  let text = ''
  node.forEach((child) => {
    text += child.isText ? child.text : '\uFFFC'.repeat(child.nodeSize)
  })
  return text
}

const pendingAtSelection = (state) => {
  const { selection } = state
  if (!selection.empty || !selection.$head.parent.isTextblock) return null
  const $head = selection.$head
  const span = inlineMathAtCaret(textblockStream($head.parent), $head.parentOffset)
  if (!span) return null
  const start = $head.start()
  return { from: start + span.from, to: start + span.to, value: span.value }
}

const mathNodeAtDeleteBoundary = (state, key) => {
  if (!state.selection.empty) return null
  const { $from } = state.selection
  const before = key === 'Backspace'
  const node = before ? $from.nodeBefore : $from.nodeAfter
  if (node?.type?.name !== 'math_inline') return null
  const pos = before ? $from.pos - node.nodeSize : $from.pos
  return pos >= 0 ? { pos } : null
}

// A complete `$...$` pair remains editable as text while the caret is inside,
// then becomes a math atom on blur/exit. The first adjacent delete selects that
// atom; a second delete removes it through ProseMirror's normal behavior.
export function createInlineMathEditingPlugin({ getDeleteMode = () => 'protect' } = {}) {
  return new Plugin({
    key: INLINE_MATH_KEY,
    state: {
      init: () => null,
      apply(tr, pending, _oldState, newState) {
        const meta = tr.getMeta(INLINE_MATH_KEY)
        if (meta?.clear) return null
        if (pending && tr.docChanged) {
          pending = {
            ...pending,
            from: tr.mapping.map(pending.from),
            to: tr.mapping.map(pending.to, -1)
          }
        }
        if (!tr.docChanged) return pending
        const current = pendingAtSelection(newState)
        if (current) return current
        if (!pending || pending.to > newState.doc.content.size) return null
        return newState.doc.textBetween(pending.from, pending.to) === `$${pending.value}$`
          ? pending
          : null
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (
          event.isComposing ||
          !['Backspace', 'Delete'].includes(event.key) ||
          getDeleteMode() === 'fast'
        ) return false
        if (
          view.state.selection instanceof NodeSelection &&
          view.state.selection.node?.type?.name === 'math_inline'
        ) return false
        const target = mathNodeAtDeleteBoundary(view.state, event.key)
        if (!target) return false
        event.preventDefault()
        view.dispatch(
          view.state.tr
            .setSelection(NodeSelection.create(view.state.doc, target.pos))
            .scrollIntoView()
        )
        return true
      }
    },
    appendTransaction(transactions, _oldState, newState) {
      const pending = INLINE_MATH_KEY.getState(newState)
      if (!pending) return null
      const commit = transactions.some((tr) => tr.getMeta(INLINE_MATH_KEY)?.commit)
      const caretInside =
        newState.selection.empty &&
        newState.selection.head > pending.from &&
        newState.selection.head < pending.to
      if (!commit && caretInside) return null
      const mathType = newState.schema.nodes.math_inline
      if (!mathType || pending.to > newState.doc.content.size) return null
      if (newState.doc.textBetween(pending.from, pending.to) !== `$${pending.value}$`) return null
      return newState.tr
        .replaceWith(pending.from, pending.to, mathType.create({ value: pending.value }))
        .setMeta(INLINE_MATH_KEY, { clear: true })
    },
    view(view) {
      const onBlur = () => {
        setTimeout(() => {
          if (INLINE_MATH_KEY.getState(view.state)) {
            view.dispatch(view.state.tr.setMeta(INLINE_MATH_KEY, { commit: true }))
          }
        }, 0)
      }
      view.dom.addEventListener('blur', onBlur, true)
      return { destroy: () => view.dom.removeEventListener('blur', onBlur, true) }
    }
  })
}
