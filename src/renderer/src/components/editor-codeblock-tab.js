// Crepe's default CodeMirror keymap binds Tab to line indentation. A code
// editor user expects Tab at mid-line or line-end to insert a tab at the cursor.
// Give that single binding highest precedence; Shift-Tab remains Crepe's normal
// block-dedent command.
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'

export const insertTabAtCursor = (view) => {
  if (view.readOnly) return false
  view.dispatch(view.state.replaceSelection('\t'))
  return true
}

export const tabAtCursorKeymap = Prec.highest(
  keymap.of([{ key: 'Tab', run: insertTabAtCursor }])
)

if (typeof Prec?.highest !== 'function' || typeof keymap?.of !== 'function') {
  console.warn('[EasyMarkdown] CodeMirror Tab override API changed.')
}
