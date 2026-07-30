// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createKeepFormatToolbar,
  KEEP_TEXT_COLORS
} from '../src/renderer/src/keep-format.js'

function click(button) {
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('Keep formatting toolbar DOM behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('preserves the textarea selection while toolbar buttons apply formatting', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'alpha'
    document.body.append(textarea)
    textarea.setSelectionRange(0, 5)
    const toolbar = createKeepFormatToolbar(textarea, { t: (key) => key })
    textarea.before(toolbar)
    const input = vi.fn()
    textarea.addEventListener('input', input)

    click(toolbar.querySelector('.km-format-bold'))

    expect(textarea.value).toBe('**alpha**')
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('alpha')
    expect(input).toHaveBeenCalledTimes(1)
    expect(toolbar.querySelector('.km-format-bold').getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the text-color palette and composes color inside Markdown formatting', () => {
    const textarea = document.createElement('textarea')
    textarea.value = '**alpha**'
    document.body.append(textarea)
    textarea.setSelectionRange(2, 7)
    const toolbar = createKeepFormatToolbar(textarea, { t: (key) => key })
    textarea.before(toolbar)

    click(toolbar.querySelector('.km-format-color-trigger'))
    expect(toolbar.querySelector('.km-format-palette').hidden).toBe(false)
    expect(toolbar.querySelectorAll('.km-format-swatch')).toHaveLength(KEEP_TEXT_COLORS.length)
    expect(
      [...toolbar.querySelectorAll('.km-format-palette-heading')].map((item) => item.textContent)
    ).toEqual(['tb.textColor.group.neutral', 'tb.textColor.group.theme'])
    click(toolbar.querySelector('.km-color-blue'))

    expect(textarea.value).toBe('**<span style="color: #3378c5">alpha</span>**')
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('alpha')
    expect(toolbar.querySelector('.km-format-palette').hidden).toBe(true)
  })

  it('applies highlight and an expanded dark palette color from the saved selection', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'alpha beta'
    document.body.append(textarea)
    const toolbar = createKeepFormatToolbar(textarea, { t: (key) => key })
    textarea.before(toolbar)

    textarea.setSelectionRange(0, 5)
    textarea.dispatchEvent(new Event('select'))
    click(toolbar.querySelector('.km-format-highlight'))
    expect(textarea.value).toBe('==alpha== beta')

    textarea.setSelectionRange(10, 14)
    textarea.dispatchEvent(new Event('select'))
    click(toolbar.querySelector('.km-format-color-trigger'))
    click(toolbar.querySelector('.km-color-red-dark'))
    expect(textarea.value).toBe(
      '==alpha== <span style="color: #8f2635">beta</span>'
    )
  })

  it('disables inline commands for a selection that crosses source lines', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'one\ntwo'
    document.body.append(textarea)
    const toolbar = createKeepFormatToolbar(textarea, { t: (key) => key })
    textarea.before(toolbar)
    textarea.setSelectionRange(0, textarea.value.length)
    textarea.dispatchEvent(new Event('select'))

    expect(toolbar.querySelector('.km-format-bold').disabled).toBe(true)
    expect(toolbar.querySelector('.km-format-color-trigger').disabled).toBe(true)
    expect(toolbar.querySelector('.km-format-bold').title).toContain('keep.formatSingleLine')
  })

  it('supports the same Ctrl/Cmd+B flow without committing the Keep draft', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'alpha'
    document.body.append(textarea)
    textarea.setSelectionRange(0, 5)
    createKeepFormatToolbar(textarea, { t: (key) => key })

    const event = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(textarea.value).toBe('**alpha**')
  })
})
