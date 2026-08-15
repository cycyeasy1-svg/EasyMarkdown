import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'

const inlineCodeEditingKey = new PluginKey('hm-inline-code-editing')
const inactiveEditingState = Object.freeze({
  active: false,
  pendingOpenAt: null,
  recentClosed: null
})

const inlineCodeType = (state) => state.schema.marks.inlineCode || state.schema.marks.code || null

export function inlineCodeMarkBefore(state, pos) {
  const type = inlineCodeType(state)
  if (!type || pos <= 0 || pos > state.doc.content.size) return null
  const $pos = state.doc.resolve(pos)
  const before = type.isInSet($pos.nodeBefore?.marks || [])
  const after = type.isInSet($pos.nodeAfter?.marks || [])
  return before && !after ? before : null
}

export function inlineCodeRangeAtSelection(state) {
  const type = inlineCodeType(state)
  const { selection } = state
  if (!type || !selection.empty || !selection.$head.parent.isTextblock) return null

  const parentStart = selection.$head.start()
  const caret = selection.head
  let match = null
  selection.$head.parent.forEach((node, offset) => {
    if (!node.isText || !type.isInSet(node.marks)) return
    const from = parentStart + offset
    const to = from + node.nodeSize
    if (caret >= from && caret <= to) match = { from, to }
  })
  return match
}

const editingState = (state) => {
  const current = inlineCodeEditingKey.getState(state)
  return current && typeof current === 'object' ? current : inactiveEditingState
}

const withEditingState = (tr, state) => tr.setMeta(inlineCodeEditingKey, state)
const withMark = (mark, marks = []) => mark.addToSet(marks)
const withoutMark = (type, marks = []) => marks.filter((mark) => mark.type !== type)

const dispatchInlineCodeEdit = (view, tr, nextState, onEdit, onValueChange) => {
  onEdit?.()
  view.dispatch(withEditingState(tr, nextState))
  // Plugin-owned transactions are not guaranteed to trigger Milkdown's
  // markdownUpdated callback. Publish a source snapshot explicitly as well.
  onValueChange?.()
}

// Wait for a complete, single-backtick pair before creating an inline-code
// mark. Lone openers and repeated delimiter runs remain literal Markdown.
export function createInlineCodeEditingPlugin({ onEdit, onValueChange } = {}) {
  return new Plugin({
    key: inlineCodeEditingKey,
    state: {
      init: () => inactiveEditingState,
      apply(tr, current) {
        const explicit = tr.getMeta(inlineCodeEditingKey)
        if (explicit && typeof explicit === 'object') return explicit
        if (!tr.docChanged) return tr.selectionSet ? inactiveEditingState : current
        if (current.recentClosed) return inactiveEditingState
        if (current.pendingOpenAt != null) {
          const mapped = tr.mapping.mapResult(current.pendingOpenAt, -1)
          if (mapped.deleted) return inactiveEditingState
          return { ...current, pendingOpenAt: mapped.pos }
        }
        if (tr.selectionSet) return inactiveEditingState
        return current
      }
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view
        const type = inlineCodeType(state)
        if (!type || from !== to) return false

        const current = editingState(state)
        const $from = state.doc.resolve(from)
        const baseMarks = state.storedMarks || $from.marks()

        // A second closer makes a delimiter run. Revert the just-completed mark
        // and keep both typed closing backticks as literal text.
        if (text === '`' && current.recentClosed && from === current.recentClosed.to) {
          const { from: codeFrom, to: codeTo } = current.recentClosed
          let tr = state.tr.removeMark(codeFrom, codeTo, type)
          tr = tr.insertText('`', codeFrom)
          tr = tr.insertText('``', codeTo + 1)
          tr = tr.setSelection(TextSelection.create(tr.doc, codeTo + 3))
          tr = tr.setStoredMarks(withoutMark(type, baseMarks))
          dispatchInlineCodeEdit(view, tr, inactiveEditingState, onEdit, onValueChange)
          return true
        }

        if (current.active) {
          if (text === '`') {
            const tr = state.tr
              .setSelection(TextSelection.create(state.doc, from))
              .setStoredMarks(withoutMark(type, baseMarks))
            dispatchInlineCodeEdit(view, tr, inactiveEditingState, onEdit, onValueChange)
            return true
          }
          const mark = type.create()
          const tr = state.tr.replaceWith(
            from,
            to,
            state.schema.text(text, withMark(mark, baseMarks))
          )
          tr.setSelection(TextSelection.create(tr.doc, from + text.length))
          tr.setStoredMarks(withMark(mark, baseMarks))
          dispatchInlineCodeEdit(
            view,
            tr,
            { active: true, pendingOpenAt: null, recentClosed: null },
            onEdit,
            onValueChange
          )
          return true
        }

        if (text !== '`') return false

        const openAt = current.pendingOpenAt
        const between =
          openAt != null && from > openAt ? state.doc.textBetween(openAt + 1, from, '\n', '\n') : ''
        if (openAt != null && from > openAt + 1 && between && !between.includes('`')) {
          const mark = type.create()
          let tr = state.tr.delete(openAt, openAt + 1)
          const codeFrom = openAt
          const codeTo = from - 1
          tr = tr.addMark(codeFrom, codeTo, mark)
          tr = tr.setSelection(TextSelection.create(tr.doc, codeTo))
          tr = tr.setStoredMarks(withoutMark(type, baseMarks))
          dispatchInlineCodeEdit(
            view,
            tr,
            {
              active: false,
              pendingOpenAt: null,
              recentClosed: { from: codeFrom, to: codeTo }
            },
            onEdit,
            onValueChange
          )
          return true
        }

        const previousCharacter =
          $from.parentOffset > 0
            ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset)
            : ''
        const tr = state.tr.insertText(text, from, to)
        tr.setSelection(TextSelection.create(tr.doc, from + 1))
        tr.setStoredMarks(withoutMark(type, baseMarks))
        dispatchInlineCodeEdit(
          view,
          tr,
          previousCharacter === '`' || openAt != null
            ? inactiveEditingState
            : { active: false, pendingOpenAt: from, recentClosed: null },
          onEdit,
          onValueChange
        )
        return true
      },

      handleKeyDown(view, event) {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        )
          return false

        const { state } = view
        const range = inlineCodeRangeAtSelection(state)
        const exitsLeft = event.key === 'ArrowLeft' && state.selection.head === range?.from
        const exitsRight = event.key === 'ArrowRight' && state.selection.head === range?.to
        if (!exitsLeft && !exitsRight) return false

        const type = inlineCodeType(state)
        const marks = state.storedMarks || state.selection.$head.marks()
        const tr = state.tr
          .setSelection(TextSelection.create(state.doc, state.selection.head))
          .setStoredMarks(withoutMark(type, marks))
        view.dispatch(withEditingState(tr, inactiveEditingState))
        return true
      },

      handleClick(view, pos, event) {
        const code = event.target?.closest?.('code')
        if (!code || !view.dom.contains(code)) return false
        const $pos = view.state.doc.resolve(pos)
        const type = inlineCodeType(view.state)
        const mark = type?.isInSet($pos.marks()) || inlineCodeMarkBefore(view.state, pos)
        if (!mark) return false

        const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
        tr.setStoredMarks(
          withMark(mark, view.state.storedMarks || view.state.doc.resolve(pos).marks())
        )
        view.dispatch(
          withEditingState(tr, {
            active: true,
            pendingOpenAt: null,
            recentClosed: null
          })
        )
        view.focus()
        return true
      },

      handleDOMEvents: {
        blur(view) {
          const current = editingState(view.state)
          if (current.active || current.pendingOpenAt != null || current.recentClosed) {
            view.dispatch(withEditingState(view.state.tr, inactiveEditingState))
          }
          return false
        }
      }
    }
  })
}
