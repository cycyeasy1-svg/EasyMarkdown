// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { normalizeWebPasteHtml } from '../src/renderer/src/components/editor-web-paste.js'

describe('web paste HTML normalization', () => {
  it('turns leaf layout wrappers into separate paragraphs', () => {
    const html = '<section class="line">One</section><div>Two<br>continued</div>'
    expect(normalizeWebPasteHtml(html)).toBe(
      '<p class="line">One</p><p>Two<br>continued</p>'
    )
  })

  it('keeps structural wrappers with direct block children', () => {
    const html = '<section><div><p>One</p><p>Two</p></div></section>'
    expect(normalizeWebPasteHtml(html)).toBe(html)
  })

  it('leaves unrelated clipboard HTML untouched', () => {
    const html = '<p><strong>Text</strong></p>'
    expect(normalizeWebPasteHtml(html)).toBe(html)
  })
})
