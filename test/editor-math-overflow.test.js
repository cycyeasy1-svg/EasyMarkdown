// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { syncDisplayMathOverflow } from '../src/renderer/src/components/editor-math-overflow.js'

describe('display math overflow measurement', () => {
  it('enables scrolling only when the rendered formula is wider than its box', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="milkdown-code-block"><div class="preview">
        <span class="katex-display"></span>
      </div></div>`
    const display = root.querySelector('.katex-display')
    Object.defineProperty(display, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(display, 'scrollWidth', { value: 420, configurable: true })
    syncDisplayMathOverflow(root)
    expect(display.dataset.hmMathOverflow).toBe('true')

    Object.defineProperty(display, 'scrollWidth', { value: 300, configurable: true })
    syncDisplayMathOverflow(root)
    expect(display.dataset.hmMathOverflow).toBe('false')
  })
})
