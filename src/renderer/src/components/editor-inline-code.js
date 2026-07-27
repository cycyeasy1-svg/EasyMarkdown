import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'

const inlineCodeEditingKey = new PluginKey('hm-inline-code-editing')
const inlineCodeType = (state) =>
  state.schema.marks.inlineCode || state.schema.marks.code || null

export function inlineCodeMarkBefore(state, pos) {
  const type = inlineCodeType(state)
  if (!type || pos <= 0 || pos > state.doc.content.size) return null
  const $pos = state.doc.resolve(pos)
  const before = type.isInSet($pos.nodeBefore?.marks || [])
  const after = type.isInSet($pos.nodeAfter?.marks || [])
  return before && !after ? before : null
}

const withMark = (mark, marks = []) => mark.addToSet(marks)

// Own literal backtick input before Crepe's eager inline-code rule can consume
// an earlier delimiter. Two typed backticks followed by text enter inline-code
// editing; another backtick exits. Clicking the rendered trailing edge resumes
// the mark so users can append naturally.
export function createInlineCodeEditingPlugin() {
  return new Plugin({
    key: inlineCodeEditingKey,
    state: {
      init: () => false,
      apply(tr, active) {
        const explicit = tr.getMeta(inlineCodeEditingKey)
        if (typeof explicit === 'boolean') return explicit
        return tr.selectionSet ? false : active
      }
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view
        const type = inlineCodeType(state)
        if (!type || from !== to) return false
        const baseMarks = state.storedMarks || state.doc.resolve(from).marks()
        if (inlineCodeEditingKey.getState(state)) {
          if (text === '`') {
            const tr = state.tr
              .setSelection(TextSelection.create(state.doc, from))
              .setStoredMarks(baseMarks.filter((mark) => mark.type !== type))
              .setMeta(inlineCodeEditingKey, false)
            view.dispatch(tr)
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
          tr.setMeta(inlineCodeEditingKey, true)
          view.dispatch(tr)
          return true
        }

        if (text === '`') {
          const tr = state.tr.insertText(text, from, to)
          tr.setSelection(TextSelection.create(tr.doc, from + 1))
          tr.setStoredMarks(baseMarks.filter((mark) => mark.type !== type))
          tr.setMeta(inlineCodeEditingKey, false)
          view.dispatch(tr)
          return true
        }
        if (from < 2) return false
        const $from = state.doc.resolve(from)
        if (
          $from.parentOffset < 2 ||
          $from.parent.textBetween($from.parentOffset - 2, $from.parentOffset) !== '``' ||
          type.isInSet($from.nodeBefore?.marks || [])
        ) return false

        const mark = type.create()
        const marks = withMark(mark, state.storedMarks || $from.marks())
        const tr = state.tr.delete(from - 2, from)
        tr.insert(from - 2, state.schema.text(text, marks))
        tr.setSelection(TextSelection.create(tr.doc, from - 2 + text.length))
        tr.setStoredMarks(marks)
        tr.setMeta(inlineCodeEditingKey, true)
        view.dispatch(tr)
        return true
      },
      handleClick(view, pos, event) {
        const code = event.target?.closest?.('code')
        if (!code || !view.dom.contains(code)) return false
        const mark = inlineCodeMarkBefore(view.state, pos)
        if (!mark) return false
        const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
        tr.setStoredMarks(withMark(
          mark,
          view.state.storedMarks || view.state.doc.resolve(pos).marks()
        ))
        tr.setMeta(inlineCodeEditingKey, true)
        view.dispatch(tr)
        view.focus()
        return true
      }
    }
  })
}
