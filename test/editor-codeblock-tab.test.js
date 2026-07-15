import { describe, expect, it, vi } from 'vitest'
import { insertTabAtCursor } from '../src/renderer/src/components/editor-codeblock-tab.js'

describe('CodeMirror code-block Tab override', () => {
  it('inserts a real tab at the current selection and consumes the key', () => {
    const transaction = { changes: 'tab-at-selection' }
    const view = {
      readOnly: false,
      state: { replaceSelection: vi.fn(() => transaction) },
      dispatch: vi.fn()
    }

    expect(insertTabAtCursor(view)).toBe(true)
    expect(view.state.replaceSelection).toHaveBeenCalledWith('\t')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('does not consume Tab for a read-only CodeMirror view', () => {
    const view = {
      readOnly: true,
      state: { replaceSelection: vi.fn() },
      dispatch: vi.fn()
    }

    expect(insertTabAtCursor(view)).toBe(false)
    expect(view.state.replaceSelection).not.toHaveBeenCalled()
    expect(view.dispatch).not.toHaveBeenCalled()
  })
})
