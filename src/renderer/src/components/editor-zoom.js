const ICON_ZOOM =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4M8 10.5h5M10.5 8v5"/></svg>'

function ensureButton(container, kind, t) {
  if (!container) return
  container.classList.add('hm-zoomable-embed')
  let button = container.querySelector(':scope > .hm-embed-zoom')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'hm-embed-zoom'
    button.innerHTML = ICON_ZOOM
    container.appendChild(button)
  }
  const label = kind === 'math' ? t('lightbox.zoomMath') : t('lightbox.zoomDiagram')
  button.dataset.zoomKind = kind
  button.title = label
  button.setAttribute('aria-label', label)
}

export function ensureEmbedZoomButtons(root, t) {
  if (!root) return
  root.querySelectorAll('.km-mermaid').forEach((container) => {
    if (container.querySelector('svg')) ensureButton(container, 'mermaid', t)
  })
  root.querySelectorAll('.km-math').forEach((container) => {
    if (container.querySelector('.katex-display')) ensureButton(container, 'math', t)
  })
  root.querySelectorAll('.milkdown-code-block .preview').forEach((container) => {
    if (container.querySelector('.katex-display')) ensureButton(container, 'math', t)
    else if (container.querySelector('svg')) ensureButton(container, 'mermaid', t)
  })
  root.querySelectorAll('.katex-display').forEach((display) => {
    if (display.closest('.km-math, .milkdown-code-block .preview')) return
    const container = display.closest('[data-type="math_block"]') || display.parentElement
    ensureButton(container, 'math', t)
  })
}

export function zoomItemFromButton(button) {
  if (!button) return null
  const kind = button.dataset.zoomKind
  const container = button.closest('.hm-zoomable-embed')
  const source = kind === 'math'
    ? container?.querySelector('.katex-display')
    : container?.querySelector('svg')
  if (!source) return null
  const content = source.cloneNode(true)
  content.querySelectorAll?.('button').forEach((node) => node.remove())
  if (kind === 'mermaid') {
    content.removeAttribute('width')
    content.removeAttribute('height')
    content.style.width = ''
    content.style.height = ''
    content.style.maxWidth = 'none'
    content.style.maxHeight = 'none'
  }
  return { kind, content, trigger: button }
}
