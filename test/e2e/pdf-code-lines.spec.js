import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { launchApp } from './helpers.js'
import { renderNumberedCodeBlockHtml } from '../../src/shared/code-lines.js'

test('PDF preview renders a complete multi-page numbered code block', async ({
  request: _request
}, testInfo) => {
  const { page, cleanup } = await launchApp()
  try {
    const code = Array.from({ length: 90 }, (_, index) => {
      const number = String(index + 1).padStart(3, '0')
      return `source-line-${number} ${'long-code-segment '.repeat(index === 44 ? 8 : 1)}`.trimEnd()
    }).join('\n')
    const html = `<h1>Numbered code PDF QA</h1>${renderNumberedCodeBlockHtml(code)}`
    const result = await page.evaluate(async (sourceHtml) => {
      const preview = await window.api.previewPDF(
        { html: sourceHtml, title: 'Numbered code PDF QA', headings: [] },
        'numbered-code.pdf',
        { footerEnabled: false, generateOutline: false },
        null
      )
      const raw = preview?.data
      const bytes =
        raw instanceof Uint8Array
          ? [...raw]
          : raw instanceof ArrayBuffer
            ? [...new Uint8Array(raw)]
            : Array.isArray(raw?.data)
              ? raw.data
              : Array.isArray(raw)
                ? raw
                : []
      if (preview?.token) await window.api.disposePDFPreview(preview.token)
      return { ok: preview?.ok, bytes }
    }, html)

    expect(result.ok).toBe(true)
    expect(result.bytes.length).toBeGreaterThan(10_000)
    const artifactPath = process.env.HM_PDF_QA_PATH || testInfo.outputPath('numbered-code.pdf')
    writeFileSync(artifactPath, Buffer.from(result.bytes))
    await testInfo.attach('numbered-code.pdf', {
      path: artifactPath,
      contentType: 'application/pdf'
    })
  } finally {
    await cleanup()
  }
})
