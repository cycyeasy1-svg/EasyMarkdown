// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { preparePdfSource } from '../src/renderer/src/pdf-source.js'

describe('preparePdfSource', () => {
  it('assigns deterministic heading anchors and preserves the visible title', () => {
    const source = preparePdfSource('<h1>Guide</h1><h2>Part <em>one</em></h2>', 'Guide')
    expect(source.headings).toEqual([
      { id: 'hm-pdf-heading-1', level: 1, text: 'Guide' },
      { id: 'hm-pdf-heading-2', level: 2, text: 'Part one' }
    ])
    expect(source.html).toContain('<h1 id="hm-pdf-heading-1">Guide</h1>')
  })

  it('prints the semantic MathML layer once and leaves ordinary code alone', () => {
    const source = preparePdfSource(
      '<p><span class="katex"><span class="katex-mathml"><math><mi>x</mi></math></span>' +
        '<span class="katex-html">visual duplicate</span></span></p>' +
        '<pre><code>a + b</code></pre>',
      'Math'
    )
    expect(source.html).toContain('<math><mi>x</mi></math>')
    expect(source.html).not.toContain('visual duplicate')
    expect(source.html).toContain('<pre><code>a + b</code></pre>')
  })

  it('retains structured image metadata for main-process staging', () => {
    const images = [{ placeholder: 'horsemd-pdf-resource-0001', src: 'file:///tmp/a.png' }]
    const source = preparePdfSource({
      html: '<img src="horsemd-pdf-resource-0001">',
      images
    }, 'Images')
    expect(source.images).toEqual(images)
  })
})
