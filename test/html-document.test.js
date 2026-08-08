import { describe, expect, it } from 'vitest'
import { buildHtmlDocument, buildHtmlToc } from '../src/main/html-document.js'
import { normalizeHtmlOptions } from '../src/shared/html-options.js'

describe('HTML export document', () => {
  it('normalizes style controls', () => {
    expect(normalizeHtmlOptions({ theme: 'night', contentWidth: 'wide', fontSizePx: 99, lineHeight: 1 }))
      .toMatchObject({ theme: 'night', contentWidth: 'wide', fontSizePx: 24, lineHeight: 1.4 })
  })

  it('builds a nested linked contents list at the selected depth', () => {
    const toc = buildHtmlToc([
      { id: 'one', level: 1, text: 'One & only' },
      { id: 'two', level: 2, text: '<Two>' },
      { id: 'deep', level: 4, text: 'Ignored' }
    ], { includeToc: true, tocDepth: 2 })
    expect(toc).toContain('href="#one"')
    expect(toc).toContain('One &amp; only')
    expect(toc).toContain('&lt;Two&gt;')
    expect(toc).not.toContain('Ignored')
  })

  it('creates a script-free standalone shell with language and typography', () => {
    const html = buildHtmlDocument(
      { title: '<Guide>', html: '<h1 id="intro">Intro</h1>', headings: [] },
      { theme: 'paper', includeDocumentTitle: true },
      { langAttr: ' lang="ja"', typographyCss: '.doc{font-family:serif}' }
    )
    expect(html).toContain('<html lang="ja">')
    expect(html).toContain('<title>&lt;Guide&gt;</title>')
    expect(html).toContain('<article class="doc" lang="ja">')
    expect(html).toContain('.doc{font-family:serif}')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('<script')
  })
})
