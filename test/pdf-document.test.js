import { describe, expect, it } from 'vitest'
import {
  buildPdfDocument,
  buildPdfHeaderFooter,
  buildPdfToc,
  resolvePdfPage
} from '../src/shared/pdf-document.js'

describe('PDF document assembly', () => {
  it('resolves physical page size and orientation', () => {
    expect(resolvePdfPage({ pageSize: 'A4' })).toMatchObject({
      width: 210,
      height: 297
    })
    expect(resolvePdfPage({ pageSize: 'Letter', orientation: 'landscape' })).toMatchObject({
      width: 279.4,
      height: 215.9
    })
  })

  it('builds an escaped nested table of contents within the requested depth', () => {
    const html = buildPdfToc([
      { id: 'one', level: 1, text: 'One & only' },
      { id: 'child', level: 2, text: '<Child>' },
      { id: 'deep', level: 4, text: 'Ignored' }
    ], { includeToc: true, tocDepth: 2 })
    expect(html).toContain('href="#one"')
    expect(html).toContain('One &amp; only')
    expect(html).toContain('&lt;Child&gt;')
    expect(html).not.toContain('Ignored')
  })

  it('keeps content HTML, escapes the title and rejects arbitrary lang attributes', () => {
    const valid = buildPdfDocument(
      { html: '<h1 id="x">Hello</h1>', title: '<Draft>' },
      {},
      { langAttr: ' lang="zh"' }
    )
    expect(valid).toContain('<title>&lt;Draft&gt;</title>')
    expect(valid).toContain('<main class="doc" lang="zh">')
    expect(valid).toContain('<h1 id="x">Hello</h1>')

    const invalid = buildPdfDocument('<p>Text</p>', {}, { langAttr: ' onclick="bad()"' })
    expect(invalid).toContain('<main class="doc"><p>Text</p></main>')
    expect(invalid).not.toContain('onclick')
  })

  it('uses Electron header/footer placeholders only when enabled', () => {
    expect(buildPdfHeaderFooter({ headerEnabled: false, footerEnabled: false }))
      .toMatchObject({ displayHeaderFooter: false })
    const templates = buildPdfHeaderFooter({
      documentTitle: '<Title>',
      headerEnabled: true,
      includeTitle: true,
      includeDate: true,
      footerEnabled: true,
      includePageNumbers: true
    })
    expect(templates.displayHeaderFooter).toBe(true)
    expect(templates.headerTemplate).toContain('&lt;Title&gt;')
    expect(templates.headerTemplate).toContain('class="date"')
    expect(templates.footerTemplate).toContain('class="pageNumber"')
  })
})
