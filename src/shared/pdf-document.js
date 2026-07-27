import {
  DEFAULT_PDF_OPTIONS,
  normalizePdfOptions
} from './pdf-options.js'
import {
  DEFAULT_FONT_WRITE_EN,
  DEFAULT_FONT_WRITE_ZH,
  DEFAULT_FONT_WRITE_JA
} from './fonts.js'

const PAGE_DIMENSIONS_MM = Object.freeze({
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4]
})

export { DEFAULT_PDF_OPTIONS, normalizePdfOptions }

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export function resolvePdfPage(options = {}) {
  const normalized = normalizePdfOptions(options)
  let [width, height] = normalized.pageSize === 'Custom'
    ? [normalized.customWidth, normalized.customHeight]
    : PAGE_DIMENSIONS_MM[normalized.pageSize]
  if (normalized.orientation === 'landscape') [width, height] = [height, width]
  return {
    ...normalized,
    width,
    height,
    printPageSize: {
      width: Number((width / 25.4).toFixed(4)),
      height: Number((height / 25.4).toFixed(4))
    }
  }
}

const paginationCss = (pagination) => {
  if (/^h[1-3]$/.test(pagination)) {
    return `.doc ${pagination}:not(:first-child) { break-before: page; page-break-before: always; }`
  }
  if (pagination === 'hr') {
    return '.doc hr { border: 0; margin: 0; height: 0; break-after: page; page-break-after: always; }'
  }
  return ''
}

const basePdfCss = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .doc {
    font-family: ${DEFAULT_FONT_WRITE_EN};
    font-size: 14.5px; line-height: 1.75; color: #2a2620;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    overflow-wrap: anywhere;
  }
  .doc:lang(zh) { font-family: ${DEFAULT_FONT_WRITE_ZH}; }
  .doc:lang(ja) { font-family: ${DEFAULT_FONT_WRITE_JA}; }
  .doc > :first-child { margin-top: 0 !important; }
  .doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 {
    color: #16130e; font-weight: 700; line-height: 1.3; margin: 1.6em 0 0.6em;
    break-after: avoid; page-break-after: avoid; letter-spacing: 0;
  }
  .doc h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 2px solid #e6e1d8; }
  .doc h2 { font-size: 1.5em; padding-bottom: 0.2em; border-bottom: 1px solid #ece7de; }
  .doc h3 { font-size: 1.25em; }
  .doc h4 { font-size: 1.05em; }
  .doc h5 { font-size: 1em; }
  .doc h6 { font-size: 0.92em; color: #6b655c; }
  .doc p { margin: 0.85em 0; }
  .doc a { color: #c86b35; text-decoration: none; border-bottom: 1px solid rgba(200,107,53,.35); }
  .doc strong { font-weight: 700; color: #16130e; }
  .doc em { font-style: italic; }
  .doc ul, .doc ol { margin: 0.8em 0; padding-left: 1.6em; }
  .doc li { margin: 0.32em 0; }
  .doc li::marker { color: #c86b35; }
  .doc ul.km-loose > li, .doc ol.km-loose > li { margin: 0.85em 0; }
  .doc .km-block[data-gap] { margin-top: calc(var(--km-gap, 0) * 1.75em); }
  .doc mark { color: inherit; padding: 0.05em 0.15em; border-radius: 2px; background: #fff3a3; }
  .doc mark.hm-hl-red { background: #ffc6c6; }
  .doc mark.hm-hl-blue { background: #bcd9ff; }
  .doc blockquote {
    margin: 1em 0; padding: 0.5em 1.1em; border-left: 3px solid #c86b35;
    background: rgba(200,107,53,.06); color: #6b655c; border-radius: 0 6px 6px 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc blockquote p { margin: 0.3em 0; }
  .doc code {
    font-family: 'SF Mono', SFMono-Regular, Consolas, Monaco, monospace; font-size: 0.88em;
    background: #f4f1ea; padding: 0.12em 0.4em; border-radius: 4px; color: #b3431f;
  }
  .doc pre {
    background: #f4f1ea; border: 1px solid #e6e1d8; border-radius: 8px;
    padding: 14px 16px; margin: 1em 0; overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc pre code {
    background: none; padding: 0; color: #2a2620; font-size: 0.86em; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
  }
  .doc table {
    border-collapse: collapse; width: 100%; max-width: 100%; margin: 1em 0;
    font-size: 0.9em; table-layout: fixed;
    break-inside: auto; page-break-inside: auto;
  }
  .doc thead { display: table-header-group; }
  .doc tr, .doc th, .doc td { break-inside: auto; page-break-inside: auto; }
  .doc th, .doc td {
    border: 1px solid #e6e1d8; padding: 6px 8px; text-align: left; vertical-align: top;
    min-width: 0; max-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal;
  }
  .doc th { background: #f4f1ea; font-weight: 700; color: #16130e; }
  .doc tr:nth-child(even) td { background: #faf8f4; }
  .doc img, .doc svg {
    max-width: 100%; height: auto; display: block; margin: 1em auto;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc img { border-radius: 6px; }
  .doc figure { margin: 1.1em 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .doc math { font-size: 1.05em; }
  .doc math[display="block"] {
    display: inline-block; max-width: none; overflow: visible;
    font-size: 1.18em; break-inside: avoid; page-break-inside: avoid;
  }
  .doc .hm-pdf-math-wrap {
    max-width: 100%; margin: 1.1em 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc .hm-pdf-math-wrap math[display="block"] {
    display: block; margin: 0.18em auto; max-width: 100%;
  }
  .doc hr { border: none; border-top: 1px solid #e6e1d8; margin: 1.8em 0; }
  .doc input[type="checkbox"] { margin-right: 0.4em; }
  .doc .km-frontmatter, .doc .hm-frontmatter {
    margin: 0 0 1.4em; padding: 12px 14px; border: 1px solid #e6e1d8;
    border-radius: 7px; background: #faf8f4; break-inside: avoid;
  }
  .doc .km-fm-head, .doc .hm-frontmatter-head {
    margin-bottom: 8px; color: #8a8175; font-size: 10px; font-weight: 700;
  }
  .doc .km-fm-grid, .doc .hm-frontmatter-grid {
    display: grid; grid-template-columns: minmax(80px, auto) minmax(0, 1fr);
    gap: 5px 14px; margin: 0;
  }
  .doc .km-fm-grid dt, .doc .hm-frontmatter-grid dt { color: #6b655c; font-weight: 600; }
  .doc .km-fm-grid dd, .doc .hm-frontmatter-grid dd { margin: 0; }
  .pdf-toc { font-family: ${DEFAULT_FONT_WRITE_EN}; color: #2a2620; }
  .pdf-toc.break-after { break-after: page; page-break-after: always; }
  .pdf-toc.break-after + .doc { break-before: page; page-break-before: always; }
  .pdf-toc h1 { margin: 0 0 1.2em; font-size: 2em; color: #16130e; letter-spacing: 0; }
  .pdf-toc ol { list-style: none; margin: 0; padding-left: 0; }
  .pdf-toc ol ol { padding-left: 1.35em; }
  .pdf-toc li { margin: 0.45em 0; break-inside: avoid; }
  .pdf-toc a { color: inherit; text-decoration: none; border-bottom: 1px dotted #c8c1b7; }
`

export function buildPdfCss(options = {}, typographyCss = '') {
  const page = resolvePdfPage(options)
  const { top, right, bottom, left } = page.margins
  return `@page { size: ${page.width}mm ${page.height}mm; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }\n${basePdfCss}\n${typographyCss}\n${paginationCss(page.pagination)}`
}

const normalizeHeadings = (headings, depth) => (Array.isArray(headings) ? headings : [])
  .map((heading, index) => ({
    id: String(heading?.id || `hm-pdf-heading-${index + 1}`),
    level: Math.min(6, Math.max(1, Number(heading?.level) || 1)),
    text: String(heading?.text || '').trim()
  }))
  .filter((heading) => heading.text && heading.level <= depth)

export function buildPdfToc(headings, options = {}) {
  const page = normalizePdfOptions(options)
  if (!page.includeToc) return ''
  const items = normalizeHeadings(headings, page.tocDepth)
  if (!items.length) return ''
  const root = { level: 0, children: [] }
  const stack = [root]
  for (const heading of items) {
    while (stack.length > 1 && stack.at(-1).level >= heading.level) stack.pop()
    const node = { ...heading, children: [] }
    stack.at(-1).children.push(node)
    stack.push(node)
  }
  const render = (nodes) => `<ol>${nodes.map((node) => (
    `<li><a href="#${escapeHtml(node.id)}">${escapeHtml(node.text)}</a>${node.children.length ? render(node.children) : ''}</li>`
  )).join('')}</ol>`
  return `<nav class="pdf-toc${page.tocPageBreak ? ' break-after' : ''}"><h1>${escapeHtml(page.tocTitle)}</h1>${render(root.children)}</nav>`
}

export function buildPdfDocument(source, options = {}, extras = {}) {
  const payload = typeof source === 'string' ? { html: source, headings: [], title: '' } : source || {}
  const page = normalizePdfOptions(options)
  const title = page.documentTitle || payload.title || 'EasyMarkdown'
  const css = buildPdfCss(page, extras.typographyCss)
  const toc = buildPdfToc(payload.headings, page)
  const langAttr = /^(?: lang="(?:zh|ja)")$/.test(extras.langAttr || '') ? extras.langAttr : ''
  const csp = "default-src 'none'; img-src data: file: https: http:; style-src 'unsafe-inline'; font-src data: file:;"
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${toc}<main class="doc"${langAttr}>${payload.html || ''}</main></body></html>`
}

const templateStyle = 'font-size:8px;color:#777;width:100%;padding:0 12mm;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;justify-content:space-between;gap:12px;'

export function buildPdfHeaderFooter(options = {}) {
  const page = normalizePdfOptions(options)
  const title = escapeHtml(page.documentTitle)
  const headerLeft = [page.includeTitle ? title : '', page.headerText ? escapeHtml(page.headerText) : '']
    .filter(Boolean)
    .join(' · ')
  const headerRight = page.includeDate ? '<span class="date"></span>' : ''
  const footerLeft = page.footerText ? escapeHtml(page.footerText) : ''
  const footerRight = page.includePageNumbers
    ? '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>'
    : ''
  const headerTemplate = page.headerEnabled
    ? `<div style="${templateStyle}"><span>${headerLeft}</span>${headerRight}</div>`
    : '<span></span>'
  const footerTemplate = page.footerEnabled
    ? `<div style="${templateStyle}"><span>${footerLeft}</span>${footerRight}</div>`
    : '<span></span>'
  return {
    displayHeaderFooter: page.headerEnabled || page.footerEnabled,
    headerTemplate,
    footerTemplate
  }
}
