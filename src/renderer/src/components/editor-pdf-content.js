import { codeBlockAtDom } from './editor-codeblock-source.js'
import { renderMermaidForExport } from './editor-mermaid.js'

const MERMAID_DEADLINE_MS = 8000
const isLatex = (language) => ['latex', 'tex', 'stex'].includes(language) || language.startsWith('latex')

const cleanMath = (math, display = false) => {
  const clone = math.cloneNode(true)
  if (display) clone.setAttribute('display', 'block')
  clone.querySelectorAll('annotation').forEach((node) => node.remove())
  return clone
}

const sanitizeSvg = (svg) => {
  svg.querySelectorAll('script').forEach((node) => node.remove())
  svg.querySelectorAll('*').forEach((node) => {
    ;[...node.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) ||
          (/^(?:href|src|xlink:href)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) {
        node.removeAttribute(attribute.name)
      }
    })
  })
  svg.removeAttribute('style')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  return svg
}

const mermaidFigure = (doc, markup) => {
  if (!markup) return null
  const template = doc.createElement('template')
  template.innerHTML = markup
  const svg = template.content.querySelector('svg')
  if (!svg) return null
  const figure = doc.createElement('figure')
  figure.className = 'hm-pdf-diagram hm-pdf-mermaid'
  figure.setAttribute('data-hm-pdf-preserve', '')
  figure.appendChild(sanitizeSvg(svg))
  return figure
}

const codeElement = (doc, source) => {
  const pre = doc.createElement('pre')
  const code = doc.createElement('code')
  code.textContent = String(source || '').replace(/\n+$/, '')
  pre.appendChild(code)
  return pre
}

const materializeTasks = (clone) => {
  clone.querySelectorAll('li > .label-wrapper .label.checked, li > .label-wrapper .label.unchecked')
    .forEach((label) => {
      const item = label.closest('li')
      if (!item) return
      const checkbox = clone.ownerDocument.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.disabled = true
      if (label.classList.contains('checked')) {
        checkbox.checked = true
        checkbox.setAttribute('checked', '')
      }
      item.insertBefore(checkbox, item.firstChild)
    })
}

const measureTables = (root, clone) => {
  const sourceTables = [...root.querySelectorAll('table')]
  const cloneTables = [...clone.querySelectorAll('table')]
  cloneTables.forEach((table, index) => {
    const source = sourceTables[index]
    const cells = [...(source?.rows?.[0]?.cells || [])]
    if (cells.length < 2 || cells.some((cell) => Number(cell.colSpan || 1) !== 1)) return
    const widths = cells.map((cell) => cell.getBoundingClientRect().width)
    const total = widths.reduce((sum, width) => sum + width, 0)
    if (!total || widths.some((width) => !Number.isFinite(width) || width <= 0)) return
    const colgroup = clone.ownerDocument.createElement('colgroup')
    widths.forEach((width) => {
      const col = clone.ownerDocument.createElement('col')
      col.setAttribute('data-hm-pdf-column', '')
      col.style.width = `${Number((width / total * 100).toFixed(4))}%`
      colgroup.appendChild(col)
    })
    table.querySelector(':scope > colgroup')?.remove()
    table.insertBefore(colgroup, table.firstChild)
    table.setAttribute('data-hm-pdf-table-layout', 'measured')
    table.style.width = '100%'
    table.style.maxWidth = '100%'
  })
}

const stripEditorUi = (clone) => {
  clone.querySelectorAll(
    'button, select, .language-picker, .language-list, .tools, .tools-button-group, ' +
    '.button-group, .cm-panel, .cm-tooltip, .preview-panel, .cell-handle, .line-handle, ' +
    '.handle, .add-button, .operation, .operation-item, .drag-preview, ' +
    '.milkdown-block-handle, .milkdown-toolbar, .image-resize-handle, .label-wrapper'
  ).forEach((element) => element.remove())
}

const replaceKatex = (clone) => {
  clone.querySelectorAll('.katex').forEach((katex) => {
    const math = katex.querySelector('.katex-mathml math')
    if (math) katex.replaceWith(cleanMath(math, !!katex.closest('.katex-display')))
  })
}

const stripAttributes = (clone) => {
  clone.querySelectorAll('script, iframe, object, embed, form, meta, link, base')
    .forEach((element) => element.remove())
  clone.querySelectorAll('*').forEach((element) => {
    if (element.closest('[data-hm-pdf-preserve]')) return
    const measuredTable = element.closest('table[data-hm-pdf-table-layout="measured"]')
    const preserveTableStyle = measuredTable &&
      (element === measuredTable || (element.tagName === 'COL' && element.hasAttribute('data-hm-pdf-column')))
    const isFrontmatter = !!element.closest('.hm-frontmatter-wrap, .hm-frontmatter')
    if (!isFrontmatter) element.removeAttribute('class')
    if (!preserveTableStyle) element.removeAttribute('style')
    element.removeAttribute('contenteditable')
    ;[...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) ||
          (/^(?:href|src|xlink:href)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value)) ||
          (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-hm-pdf-')) ||
          attribute.name.startsWith('aria-')) {
        element.removeAttribute(attribute.name)
      }
    })
  })
  clone.querySelectorAll('[data-hm-pdf-preserve]')
    .forEach((element) => element.removeAttribute('data-hm-pdf-preserve'))
}

export async function createEditorSnapshot(view, { stageImages = false } = {}) {
  if (!view?.dom) return stageImages ? { html: '', images: [] } : ''
  const root = view.dom
  const clone = root.cloneNode(true)
  materializeTasks(clone)
  measureTables(root, clone)

  const sourceBlocks = [...root.querySelectorAll('.milkdown-code-block')]
  const cloneBlocks = [...clone.querySelectorAll('.milkdown-code-block')]
  const deadline = Date.now() + MERMAID_DEADLINE_MS
  for (let index = 0; index < cloneBlocks.length; index += 1) {
    const cloneBlock = cloneBlocks[index]
    const resolved = codeBlockAtDom(view, sourceBlocks[index])
    const source = resolved?.node?.textContent || ''
    const language = String(resolved?.node?.attrs?.language || '').trim().toLowerCase()
    if (language === 'mermaid' && source.trim()) {
      const remaining = deadline - Date.now()
      const svg = remaining > 0
        ? await Promise.race([
            renderMermaidForExport(source, { theme: 'default' }),
            new Promise((resolve) => setTimeout(() => resolve(null), remaining))
          ])
        : null
      const figure = mermaidFigure(clone.ownerDocument, svg)
      cloneBlock.replaceWith(figure || codeElement(clone.ownerDocument, source))
      continue
    }
    if (isLatex(language)) {
      const math = cloneBlock.querySelector('.katex-mathml math, .preview math')
      if (math) {
        const figure = clone.ownerDocument.createElement('figure')
        figure.appendChild(cleanMath(math, true))
        cloneBlock.replaceWith(figure)
        continue
      }
    }
    cloneBlock.replaceWith(codeElement(clone.ownerDocument, source))
  }

  replaceKatex(clone)
  stripEditorUi(clone)

  const imageSources = [...root.querySelectorAll('img')].map((image) =>
    image.currentSrc || image.getAttribute('src') || '')
  const images = []
  ;[...clone.querySelectorAll('img')].forEach((image, index) => {
    const src = imageSources[index] || image.getAttribute('src') || ''
    image.removeAttribute('srcset')
    if (!src) {
      image.remove()
      return
    }
    if (!stageImages || /^data:/i.test(src)) {
      image.setAttribute('src', src)
      return
    }
    const placeholder = `horsemd-pdf-resource-${String(index + 1).padStart(4, '0')}`
    image.setAttribute('src', placeholder)
    images.push({ placeholder, src })
  })

  stripAttributes(clone)
  return stageImages ? { html: clone.innerHTML, images } : clone.innerHTML
}
