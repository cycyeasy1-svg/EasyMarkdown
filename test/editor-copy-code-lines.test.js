// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { materializeCopiedCodeLines } from '../src/renderer/src/components/editor-copy.js'

describe('materializeCopiedCodeLines', () => {
  it('turns visual rows back into exact source text without generated numbers', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<pre class="hm-code-block"><code class="hm-code-lines">' +
      '<span class="hm-code-line"><span class="hm-code-line-text">first</span></span>' +
      '<span class="hm-code-line"><span class="hm-code-line-text"></span></span>' +
      '<span class="hm-code-line"><span class="hm-code-line-text">third</span></span>' +
      '</code></pre>'

    expect(materializeCopiedCodeLines(root)).toBe(true)
    expect(root.querySelector('code').textContent).toBe('first\n\nthird')
    expect(root.textContent).not.toContain('1')
  })
})
