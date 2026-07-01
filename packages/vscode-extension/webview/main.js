// Keep-mode webview — framework-free port of the app's KeepEditor.jsx.
//
// The TextDocument (in the extension host) is the single source of truth. This
// view renders it and, on every committed edit, posts a MINIMAL line-range diff
// ({startLine,endLine,lines}) back to the host, which applies one WorkspaceEdit —
// so untouched bytes never move (zero diff) and VSCode owns dirty/undo/save.
//
// We keep `lines` \r-stripped (host owns the EOL and re-joins with the document's
// own line-ending), which collapses the app's rawLines/viewLines distinction into
// one array and drops all the manual \r juggling.

import {
  renderDoc,
  renderBlockInner,
  inline,
  replaceCellInLine,
  insertColumnInLine,
  removeColumnInLine,
  buildTableRow
} from '../../../src/renderer/src/keep-parser.js'
import { inlineRichStyles } from '../../../src/renderer/src/components/editor-copy.js'
import { isRelativePath } from '../../../src/renderer/src/components/editor-images.js'
import { enhanceKeepTables } from '../../../src/renderer/src/components/editor-tablescroll.js'
import { getMermaidSvg, peekMermaidSvg } from './mermaid-core.js'
import { makeT } from './i18n.js'
// Layout controls share the app's pure settings module directly (apply* set CSS
// vars on the document root + the full-width body class; presets/bounds match).
// We persist via the host's globalState instead of localStorage.
import {
  applyPageWidth,
  applyFontSize,
  applyZoom,
  applyLineHeight,
  applyParagraphSpacing,
  DEFAULT_SETTINGS,
  PAGE_WIDTH_PRESETS,
  PAGE_WIDTH_MIN,
  PAGE_WIDTH_MAX,
  FONT_SIZE_PRESETS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  ZOOM_PRESETS,
  ZOOM_MIN,
  ZOOM_MAX,
  LINE_HEIGHT_PRESETS,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  PARA_SPACING_PRESETS,
  PARA_SPACING_MIN,
  PARA_SPACING_MAX
} from '../../../src/renderer/src/settings.js'
import './keep.css'
import 'katex/dist/katex.min.css'

const vscode = acquireVsCodeApi()

const COPY_WRAP =
  'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#24292f;'

const host = document.getElementById('km-host')

// ── document state ──
let lines = [] // \r-stripped source mirror
let blocks = []
let filterState = {} // tableIdx -> { colIdx: Set(excluded values) }
let baseUri = '' // webview URI of the document folder, for relative images
let t = makeT('en')
let ready = false
let layout = { ...DEFAULT_SETTINGS } // page width / font size / zoom / line-height / para spacing
const collapsed = new Set() // collapsed heading-section keys ("level:text"), survives re-render
let tableScroll = null // wide-table top-scrollbar + floating-header handle (editor-tablescroll)

const stripCR = (l) => (l.endsWith('\r') ? l.slice(0, -1) : l)
const escapeHtmlLocal = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttrLocal = (s) => escapeHtmlLocal(s).replace(/"/g, '&quot;')

// ── host messaging ──
window.addEventListener('message', (e) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'init') {
    baseUri = (msg.baseUri || '').replace(/\/+$/, '')
    t = makeT(msg.lang || 'en')
    if (msg.layout) layout = { ...DEFAULT_SETTINGS, ...msg.layout }
    applyLayout(layout)
    ensureSourceButton()
    ensureLayoutButton()
    setText(msg.text || '')
  } else if (msg.type === 'update') {
    // External edit / undo / redo — reset the mirror and re-render. Any open edit
    // popover is torn down (its anchor may no longer exist).
    closeFloating()
    setText(msg.text || '')
  }
})

function setText(text) {
  lines = text.split('\n').map(stripCR)
  filterState = {}
  rerender()
}

// Minimal-diff commit: trim the common prefix/suffix between the old and new
// `lines`, post just the changed range. `endLine < startLine` ⇒ a pure insertion.
function commit(oldLines) {
  const a = oldLines
  const b = lines
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  const startLine = p
  const endLine = a.length - 1 - s
  const slice = b.slice(p, b.length - s)
  if (endLine < startLine && slice.length === 0) return // nothing actually changed
  vscode.postMessage({ type: 'replaceLines', startLine, endLine, lines: slice })
}

// Run a mutation against `lines`, then post its minimal diff to the host.
function mutate(fn) {
  const old = lines.slice()
  fn()
  commit(old)
}

// ── image src resolution (relative → webview URI) ──
function resolveImgSrcs(root) {
  if (!baseUri) return
  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src')
    if (src && isRelativePath(src)) {
      try {
        img.src = new URL(src, baseUri + '/').toString()
      } catch {
        /* leave as-is */
      }
    }
  })
}

// ── render ──
const LARGE_DOC_LINES = 1200
let afterPaintRaf = 0
let embedObserver = null
let katexPromise = null
const cancelAfterPaint = () => {
  if (afterPaintRaf) {
    cancelAnimationFrame(afterPaintRaf)
    afterPaintRaf = 0
  }
}

function rerender() {
  const r = renderDoc(lines, filterState, {
    srcEditLabel: t('keep.editSource'),
    collapseLabel: t('keep.toggleSection')
  })
  r.blocks.forEach((b, i) => {
    b.bi = i
  })
  blocks = r.blocks
  const html = r.html

  const paint = () => {
    host.innerHTML = html
    resolveImgSrcs(host)
    cancelAfterPaint()
    afterPaintRaf = requestAnimationFrame(finishRender)
  }

  cancelAfterPaint()
  if (blocks.length && lines.length > LARGE_DOC_LINES) {
    host.innerHTML =
      '<div class="km-loading"><span class="km-spinner"></span>' +
      escapeHtmlLocal(t('keep.loading')) +
      '</div>'
    afterPaintRaf = requestAnimationFrame(() => {
      afterPaintRaf = requestAnimationFrame(paint)
    })
  } else {
    paint()
  }
}

function finishRender() {
  applyMultilineFlags()
  applyCollapsed()
  Object.keys(filterState).forEach((ti) => applyFilter(parseInt(ti)))
  if (embedObserver) embedObserver.disconnect()
  observeEmbeds()
  // Wide-table affordances (in-flow top scrollbar + viewport-fixed floating header)
  // live partly outside the block flow (the float is appended to <body>), so rebuild
  // them once the document is painted and tear the old ones down first.
  tableScroll?.destroy()
  tableScroll = enhanceKeepTables(host, host.closest('.editor-scroll'), {
    onFilterClick: (clonedBtn) => openFilterPop(clonedBtn),
    onHeaderEdit: (clonedTh) => {
      // Resolve the clicked clone to the REAL <th> (same data-line/data-ci → same
      // source line) and edit that, anchoring the popup under the visible clone.
      const real = host.querySelector(
        'th[data-line="' +
          clonedTh.getAttribute('data-line') +
          '"][data-ci="' +
          clonedTh.getAttribute('data-ci') +
          '"]'
      )
      if (real) openCellPop(real, clonedTh)
    }
  })
}

// ── heading section collapse / expand (display-only; never touches the source) ──
// A heading block carries `data-hlevel`. Collapsing one hides every following
// block until the next heading of the same or higher level. `collapsed` (a Set of
// section keys) survives the full re-render an edit triggers; the live
// `km-collapsed` class on heading blocks is what visibility is derived from.
function sectionKey(headEl) {
  const lvl = headEl.getAttribute('data-hlevel') || ''
  const h = headEl.querySelector('h1,h2,h3,h4,h5,h6')
  return lvl + ':' + (h ? (h.textContent || '').trim() : '')
}
function refreshVisibility() {
  const stack = []
  host.querySelectorAll('.km-block').forEach((el) => {
    const isHeading = el.hasAttribute('data-hlevel')
    const lvl = isHeading ? parseInt(el.getAttribute('data-hlevel')) : null
    if (isHeading) while (stack.length && stack[stack.length - 1] >= lvl) stack.pop()
    el.classList.toggle('km-section-hidden', stack.length > 0)
    if (isHeading && el.classList.contains('km-collapsed')) stack.push(lvl)
  })
}
function toggleSection(headEl) {
  const isCollapsed = !headEl.classList.contains('km-collapsed')
  headEl.classList.toggle('km-collapsed', isCollapsed)
  if (isCollapsed) collapsed.add(sectionKey(headEl))
  else collapsed.delete(sectionKey(headEl))
  refreshVisibility()
  tableScroll?.update() // hidden/shown tables change the layout
}
function applyCollapsed() {
  host.querySelectorAll('.km-block[data-hlevel]').forEach((el) => {
    el.classList.toggle('km-collapsed', collapsed.has(sectionKey(el)))
  })
  refreshVisibility()
}

function applyMultilineFlags() {
  const elByBi = new Map()
  host.querySelectorAll('.km-block').forEach((el) => {
    const bi = el.getAttribute('data-bi')
    if (bi != null) elByBi.set(Number(bi), el)
  })
  const baseFs = parseFloat(getComputedStyle(host).fontSize) || 16
  const pending = []
  blocks.forEach((b, bi) => {
    if (b.type === 'table') return
    const bl = elByBi.get(bi)
    if (!bl) return
    let multi = b.end > b.start
    if (!multi) {
      const content = Array.from(bl.children).find((c) => !c.classList.contains('km-src-edit'))
      if (content) multi = content.offsetHeight > baseFs * 2.2
    }
    pending.push([bl, multi])
  })
  pending.forEach(([bl, multi]) => bl.classList.toggle('km-multiline', multi))
}
function applyMultilineForBlock(bl, b) {
  if (!bl || b.type === 'table') return
  let multi = b.end > b.start
  if (!multi) {
    const content = Array.from(bl.children).find((c) => !c.classList.contains('km-src-edit'))
    if (content) {
      const fs = parseFloat(getComputedStyle(bl).fontSize) || 16
      multi = content.offsetHeight > fs * 2.2
    }
  }
  bl.classList.toggle('km-multiline', multi)
}

// ── embeds (mermaid / KaTeX) ──
function renderMermaidEl(el) {
  const code = el.getAttribute('data-code') || ''
  const cached = peekMermaidSvg(code)
  if (cached && cached.svg) {
    el.innerHTML = cached.svg
    return
  }
  el.classList.add('hm-mermaid-hint')
  el.textContent = t('mermaid.rendering')
  getMermaidSvg(code).then((res) => {
    if (!host.contains(el)) return
    el.classList.remove('hm-mermaid-hint')
    if (res && res.svg) el.innerHTML = res.svg
    else {
      el.classList.add('hm-mermaid-error')
      el.textContent = t('mermaid.error') + ' ' + ((res && res.error) || '')
    }
  })
}
function getKatex() {
  if (!katexPromise) {
    katexPromise = import('katex')
      .then((m) => m.default || m)
      .catch(() => null)
  }
  return katexPromise
}
function renderMathEl(el) {
  getKatex().then((katex) => {
    if (!katex || !host.contains(el)) return
    const tex = el.getAttribute('data-tex') || ''
    try {
      katex.render(tex, el, { displayMode: true, throwOnError: false })
    } catch (e) {
      el.classList.add('hm-mermaid-error')
      el.textContent = String((e && e.message) || e)
    }
  })
}
function ensureEmbedObserver() {
  if (!embedObserver) {
    embedObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          obs.unobserve(e.target)
          if (e.target.classList.contains('km-mermaid')) renderMermaidEl(e.target)
          else renderMathEl(e.target)
        })
      },
      { root: host.closest('.editor-scroll') || null, rootMargin: '400px' }
    )
  }
  return embedObserver
}
function observeEmbed(el) {
  if (el.classList.contains('km-mermaid')) {
    const cached = peekMermaidSvg(el.getAttribute('data-code') || '')
    if (cached && cached.svg) {
      el.innerHTML = cached.svg
      return
    }
  }
  ensureEmbedObserver().observe(el)
}
function observeEmbeds(root) {
  ;(root || host).querySelectorAll('.km-mermaid, .km-math').forEach(observeEmbed)
}

// ── floating popovers (cell editor / filter / table menu / confirm) ──
let activeCellPop = null
let activeBlockEdit = null
let activeConfirm = null
let activePop = null
let activePopBtn = null
let activeMenu = null

function closeFloating() {
  closePop()
  closeMenu()
  closeConfirm()
  closeCellPop()
  closeLayoutPop()
}

// ── table cell editing ──
function closeCellPop() {
  if (activeCellPop) {
    activeCellPop.pop.remove()
    activeCellPop = null
  }
}
function repositionCellPop() {
  if (!activeCellPop) return
  const { pop } = activeCellPop
  const r = (activeCellPop.anchor || activeCellPop.td).getBoundingClientRect()
  const pw = pop.offsetWidth || 360
  const ph = pop.offsetHeight || 160
  const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8))
  let top = r.bottom + 6
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6)
  pop.style.left = left + 'px'
  pop.style.top = top + 'px'
  const sc = host.closest('.editor-scroll')
  if (sc) {
    const sr = sc.getBoundingClientRect()
    pop.style.visibility = r.bottom < sr.top || r.top > sr.bottom ? 'hidden' : 'visible'
  }
}
function repositionFilterPop() {
  if (!activePop || !activePopBtn) return
  const r = activePopBtn.getBoundingClientRect()
  activePop.style.left = Math.min(r.left, window.innerWidth - 260) + 'px'
  activePop.style.top = r.bottom + 4 + 'px'
  const sc = host.closest('.editor-scroll')
  if (sc) {
    const sr = sc.getBoundingClientRect()
    activePop.style.visibility = r.bottom < sr.top || r.top > sr.bottom ? 'hidden' : 'visible'
  }
}
function commitCellPop() {
  const cur = activeCellPop
  if (!cur) return
  const ta = cur.pop.querySelector('textarea')
  const val = ta ? ta.value.replace(/\n/g, '<br>') : cur.raw
  const td = cur.td
  closeCellPop()
  if (val === cur.raw) return
  mutate(() => {
    lines[cur.lineIdx] = stripCR(replaceCellInLine(lines[cur.lineIdx], cur.colIdx, val))
  })
  if (td && host.contains(td)) {
    td.setAttribute('data-raw', val)
    if (td.tagName === 'TH') {
      const span = td.querySelector('.km-th-content')
      if (span) span.innerHTML = inline(val)
      tableScroll?.refreshContent() // keep the floating-header clone's text in sync
    } else {
      td.innerHTML = inline(val)
    }
    resolveImgSrcs(td)
  } else {
    rerender()
  }
}

// ── block source edit ──
function closeBlockEdit(commitChange) {
  const cur = activeBlockEdit
  if (!cur) return
  activeBlockEdit = null
  if (commitChange) {
    const { ta, b } = cur
    const newLines = ta.value.split('\n').map(stripCR)
    mutate(() => {
      lines.splice(b.start, b.end - b.start + 1, ...newLines)
    })
    rerender()
    return
  }
  const b = cur.b
  const bi = b.bi != null ? b.bi : blocks.indexOf(b)
  const blockDiv = bi >= 0 ? host.querySelector('.km-block[data-bi="' + bi + '"]') : null
  if (blockDiv) {
    blockDiv.innerHTML = renderBlockInner(b, bi, lines, {
      srcEditLabel: t('keep.editSource'),
      filterState
    })
    resolveImgSrcs(blockDiv)
    applyMultilineForBlock(blockDiv, b)
    observeEmbeds(blockDiv)
  } else {
    rerender()
  }
}

// ── confirm modal ──
function closeConfirm() {
  if (activeConfirm) {
    activeConfirm.remove()
    activeConfirm = null
  }
}
function showConfirm(message, { onSave, onDiscard }) {
  closeConfirm()
  const wrap = document.createElement('div')
  const backdrop = document.createElement('div')
  backdrop.className = 'menu-backdrop'
  backdrop.style.zIndex = '1400'
  const box = document.createElement('div')
  box.className = 'hm-rename-modal'
  box.style.zIndex = '1401'
  box.style.animation = 'fadeIn 0.12s var(--ease-out)'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  const title = document.createElement('div')
  title.className = 'hm-rename-title'
  title.textContent = message
  const actions = document.createElement('div')
  actions.className = 'hm-rename-actions'
  const discard = document.createElement('button')
  discard.type = 'button'
  discard.textContent = t('keep.editDiscardBtn')
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = t('edit.cancel')
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'primary'
  save.textContent = t('keep.editSaveBtn')
  actions.append(save, discard, cancel)
  box.append(title, actions)
  wrap.append(backdrop, box)
  document.body.appendChild(wrap)
  activeConfirm = wrap
  const done = (fn) => () => {
    closeConfirm()
    fn?.()
  }
  backdrop.onclick = done(null)
  cancel.onclick = done(null)
  discard.onclick = done(onDiscard)
  save.onclick = done(onSave)
  save.focus({ preventScroll: true })
}

// Enforce "one edit bar": close whatever is open (prompting if dirty), then build.
function openAfterClose(build) {
  const cell = activeCellPop
  const blk = activeBlockEdit
  if (!cell && !blk) return build()
  const msg = t('confirm.keepEditSave')
  if (cell) {
    const ta = cell.pop.querySelector('textarea')
    const val = ta ? ta.value.replace(/\n/g, '<br>') : cell.raw
    if (val === cell.raw) {
      closeCellPop()
      return build()
    }
    return showConfirm(msg, {
      onSave: () => {
        commitCellPop()
        build()
      },
      onDiscard: () => {
        closeCellPop()
        build()
      }
    })
  }
  if (blk.ta.value === blk.originalRaw) {
    closeBlockEdit(false)
    return build()
  }
  return showConfirm(msg, {
    onSave: () => {
      closeBlockEdit(true)
      build()
    },
    onDiscard: () => {
      closeBlockEdit(false)
      build()
    }
  })
}

function openCellPop(td, anchorEl) {
  openAfterClose(() => {
    if (!host.contains(td)) {
      const lineAttr = td.getAttribute('data-line')
      const ciAttr = td.getAttribute('data-ci')
      const sel =
        'td[data-line="' + lineAttr + '"][data-ci="' + ciAttr + '"],' +
        'th[data-line="' + lineAttr + '"][data-ci="' + ciAttr + '"]'
      td = host.querySelector(sel)
      if (!td) return
    }
    const raw = td.getAttribute('data-raw') || ''
    const lineIdx = parseInt(td.getAttribute('data-line'))
    const colIdx = parseInt(td.getAttribute('data-ci'))
    const pop = document.createElement('div')
    pop.className = 'km-cell-pop'
    const ta = document.createElement('textarea')
    ta.className = 'km-cp-input'
    ta.value = raw.replace(/<br\s*\/?>/gi, '\n')
    const act = document.createElement('div')
    act.className = 'km-cp-actions'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'ok'
    ok.textContent = t('keep.editConfirmKey')
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = t('edit.cancel')
    act.appendChild(ok)
    act.appendChild(cancel)
    pop.appendChild(ta)
    pop.appendChild(act)
    document.body.appendChild(pop)
    activeCellPop = { pop, td, anchor: anchorEl && document.body.contains(anchorEl) ? anchorEl : td, raw, lineIdx, colIdx }
    repositionCellPop()
    ta.focus()
    ta.select()
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeCellPop()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        commitCellPop()
      }
    })
    cancel.onclick = () => closeCellPop()
    ok.onclick = () => commitCellPop()
  })
}

function startBlockEdit(bi) {
  openAfterClose(() => {
    const b = blocks[bi]
    if (!b) return
    const blockDiv = host.querySelector('.km-block[data-bi="' + bi + '"]')
    if (!blockDiv) return
    const raw = lines.slice(b.start, b.end + 1).join('\n')
    const ta = document.createElement('textarea')
    ta.className = 'km-src-editor'
    ta.value = raw
    ta.rows = Math.min(20, raw.split('\n').length + 1)
    const act = document.createElement('div')
    act.className = 'km-src-actions'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'ok'
    ok.textContent = t('keep.editConfirmKey')
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = t('edit.cancel')
    act.appendChild(ok)
    act.appendChild(cancel)
    blockDiv.innerHTML = ''
    blockDiv.appendChild(ta)
    blockDiv.appendChild(act)
    ta.focus()
    activeBlockEdit = { ta, b, originalRaw: raw }
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeBlockEdit(false)
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        closeBlockEdit(true)
      }
    })
    cancel.onclick = () => closeBlockEdit(false)
    ok.onclick = () => closeBlockEdit(true)
  })
}

// ── structural table edits ──
const getTable = (ti) => blocks.filter((b) => b.type === 'table')[ti]

function doInsertRow(ti, ri, where) {
  const b = getTable(ti)
  if (!b) return
  let at
  if (where === 'first') at = b.sepLine + 1
  else if (where === 'above') at = b.dataRows[ri]?.lineIdx
  else at = (b.dataRows[ri]?.lineIdx ?? b.sepLine) + 1
  if (at == null) return
  const row = stripCR(buildTableRow(b.headers.length, lines[b.headerLine] || ''))
  mutate(() => lines.splice(at, 0, row))
  rerender()
}
function doDeleteRow(ti, ri) {
  const b = getTable(ti)
  if (!b) return
  const dr = b.dataRows[ri]
  if (!dr) return
  mutate(() => lines.splice(dr.lineIdx, 1))
  rerender()
}
function doInsertColumn(ti, colIdx) {
  const b = getTable(ti)
  if (!b) return
  mutate(() => {
    for (let ln = b.start; ln <= b.end; ln++) {
      const content = ln === b.sepLine ? '---' : ''
      lines[ln] = stripCR(insertColumnInLine(lines[ln], colIdx, content))
    }
  })
  delete filterState[ti]
  rerender()
}
function doDeleteColumn(ti, colIdx) {
  const b = getTable(ti)
  if (!b || b.headers.length <= 1) return
  mutate(() => {
    for (let ln = b.start; ln <= b.end; ln++) {
      lines[ln] = stripCR(removeColumnInLine(lines[ln], colIdx))
    }
  })
  delete filterState[ti]
  rerender()
}

// ── context menu ──
function closeMenu() {
  if (activeMenu) {
    activeMenu.remove()
    activeMenu = null
  }
}
function openMenu(x, y, items) {
  closeMenu()
  const menu = document.createElement('div')
  menu.className = 'km-table-menu'
  items.forEach((it) => {
    if (it === 'sep') {
      const hr = document.createElement('div')
      hr.className = 'km-tm-sep'
      menu.appendChild(hr)
      return
    }
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'km-tm-item' + (it.disabled ? ' disabled' : '')
    el.textContent = it.label
    if (!it.disabled)
      el.onclick = () => {
        closeMenu()
        it.fn()
      }
    menu.appendChild(el)
  })
  document.body.appendChild(menu)
  const mw = menu.offsetWidth || 180
  const mh = menu.offsetHeight || 0
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px'
  menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px'
  activeMenu = menu
}
function buildTableItems(items, ti, ri, ci, isHeader) {
  const b = getTable(ti)
  if (isHeader) {
    items.push({ label: t('keep.rowInsertFirst'), fn: () => doInsertRow(ti, ri, 'first') })
  } else {
    items.push({ label: t('keep.rowInsertAbove'), fn: () => doInsertRow(ti, ri, 'above') })
    items.push({ label: t('keep.rowInsertBelow'), fn: () => doInsertRow(ti, ri, 'below') })
  }
  items.push('sep')
  items.push({ label: t('keep.colInsertLeft'), fn: () => doInsertColumn(ti, ci) })
  items.push({ label: t('keep.colInsertRight'), fn: () => doInsertColumn(ti, ci + 1) })
  items.push('sep')
  if (!isHeader) items.push({ label: t('keep.rowDelete'), fn: () => doDeleteRow(ti, ri) })
  items.push({
    label: t('keep.colDelete'),
    fn: () => doDeleteColumn(ti, ci),
    disabled: !b || b.headers.length <= 1
  })
}

// ── rich copy ──
function writeClipboard(html, plain) {
  const text = plain || ''
  try {
    navigator.clipboard
      .write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ])
      .catch(() => navigator.clipboard.writeText(text).catch(() => {}))
  } catch {
    navigator.clipboard?.writeText?.(text).catch(() => {})
  }
}
function richHtml(node) {
  const wrap = document.createElement('div')
  wrap.appendChild(node)
  wrap.querySelectorAll('.km-src-edit, .km-filter-btn, button').forEach((el) => el.remove())
  inlineRichStyles(wrap)
  return { html: `<div style="${COPY_WRAP}">${wrap.innerHTML}</div>`, text: wrap.textContent || '' }
}
function writeRich(node, plain) {
  const r = richHtml(node)
  writeClipboard(r.html, plain != null ? plain : r.text)
}
const copyElement = (el) => writeRich(el.cloneNode(true))
function copySelection(sel) {
  try {
    writeRich(sel.getRangeAt(0).cloneContents(), sel.toString())
  } catch {
    /* nothing selected */
  }
}
function cellPlain(c) {
  if (!c) return ''
  const cl = c.cloneNode(true)
  cl.querySelectorAll('.km-filter-btn').forEach((el) => el.remove())
  cl.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
  return (cl.textContent || '').trim()
}
function wrapRows(rows) {
  const tbl = document.createElement('table')
  const tb = document.createElement('tbody')
  rows.forEach((tr) => tb.appendChild(tr))
  tbl.appendChild(tb)
  return tbl
}
function copyTable(table) {
  const rows = [...table.querySelectorAll('tr')]
  const tsv = rows.map((tr) => [...tr.children].map(cellPlain).join('\t')).join('\n')
  writeRich(table.cloneNode(true), tsv)
}
function copyRow(tr) {
  const tsv = [...tr.children].map(cellPlain).join('\t')
  writeRich(wrapRows([tr.cloneNode(true)]), tsv)
}
function copyColumn(table, ci) {
  const rows = [...table.querySelectorAll('tr')]
  const tsv = rows.map((tr) => cellPlain(tr.children[ci])).join('\n')
  const colRows = rows
    .map((tr) => tr.children[ci])
    .filter(Boolean)
    .map((c) => {
      const tr = document.createElement('tr')
      tr.appendChild(c.cloneNode(true))
      return tr
    })
  writeRich(wrapRows(colRows), tsv)
}
function onCopy(e) {
  if (activeCellPop) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !host.contains(sel.anchorNode)) return
  try {
    const wrap = document.createElement('div')
    wrap.appendChild(sel.getRangeAt(0).cloneContents())
    wrap.querySelectorAll('.km-src-edit, .km-filter-btn, button').forEach((el) => el.remove())
    inlineRichStyles(wrap)
    const plain = sel.toString()
    if (!wrap.innerHTML.trim() && !plain) return
    e.clipboardData.setData('text/html', `<div style="${COPY_WRAP}">${wrap.innerHTML}</div>`)
    e.clipboardData.setData('text/plain', plain)
    e.preventDefault()
  } catch {
    /* default copy */
  }
}

// ── column filter (display only) ──
function closePop() {
  if (activePop) {
    activePop.remove()
    activePop = null
  }
  activePopBtn = null
}
function openFilterPop(btn) {
  closePop()
  const ti = parseInt(btn.getAttribute('data-ti'))
  const ci = parseInt(btn.getAttribute('data-ci'))
  const table = host.querySelector('table[data-ti="' + ti + '"]')
  if (!table) return
  const values = new Set()
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const td = tr.children[ci]
    const v = (td?.getAttribute('data-raw') || '').trim()
    values.add(v === '' ? '(空白)' : v)
  })
  filterState[ti] = filterState[ti] || {}
  const excluded = filterState[ti][ci] || new Set()

  const pop = document.createElement('div')
  pop.className = 'km-filter-pop'
  pop.innerHTML =
    '<input class="km-fp-search" placeholder="' +
    escapeAttrLocal(t('keep.filterSearch')) +
    '">' +
    '<div class="km-fp-tools"><a data-all="1">' +
    escapeHtmlLocal(t('keep.selectAll')) +
    '</a><a data-all="0">' +
    escapeHtmlLocal(t('keep.selectNone')) +
    '</a></div>' +
    '<div class="km-fp-list"></div>' +
    '<div class="km-fp-actions"><button type="button" class="ok">' +
    escapeHtmlLocal(t('edit.confirm')) +
    '</button><button type="button" class="cancel">' +
    escapeHtmlLocal(t('edit.cancel')) +
    '</button></div>'
  const list = pop.querySelector('.km-fp-list')
  const sorted = [...values].sort((a, b) => a.localeCompare(b, 'ja'))
  const buildList = (filter) => {
    list.innerHTML = ''
    sorted
      .filter((v) => !filter || v.replace(/<br>/g, ' ').includes(filter))
      .forEach((v) => {
        const lab = document.createElement('label')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !excluded.has(v)
        cb.dataset.v = v
        const span = document.createElement('span')
        span.innerHTML = inline(v)
        lab.appendChild(cb)
        lab.appendChild(span)
        list.appendChild(lab)
      })
  }
  buildList('')
  pop.querySelector('.km-fp-search').addEventListener('input', (e) => buildList(e.target.value))
  pop.querySelectorAll('.km-fp-tools a').forEach((a) => {
    a.onclick = () => {
      const on = a.dataset.all === '1'
      list.querySelectorAll('input').forEach((cb) => (cb.checked = on))
    }
  })
  pop.querySelector('.cancel').onclick = closePop
  pop.querySelector('.ok').onclick = () => {
    const ex = new Set()
    const shown = new Set([...list.querySelectorAll('input')].map((cb) => cb.dataset.v))
    sorted.forEach((v) => {
      if (!shown.has(v) && excluded.has(v)) ex.add(v)
    })
    list.querySelectorAll('input').forEach((cb) => {
      if (!cb.checked) ex.add(cb.dataset.v)
    })
    if (ex.size > 0) filterState[ti][ci] = ex
    else delete filterState[ti][ci]
    closePop()
    applyFilter(ti)
    const cols = filterState[ti]
    const isActive = !!(cols && cols[ci] && cols[ci].size > 0)
    // Toggle ▼ active on every copy of this column's button — the live header AND
    // the floating-header clone (which may be the one that was clicked).
    host
      .querySelectorAll('.km-filter-btn[data-ti="' + ti + '"][data-ci="' + ci + '"]')
      .forEach((b) => b.classList.toggle('active', isActive))
    document
      .querySelectorAll('.km-float-header .km-filter-btn[data-ti="' + ti + '"][data-ci="' + ci + '"]')
      .forEach((b) => b.classList.toggle('active', isActive))
    // Hiding rows can reflow column widths — re-measure the floating header.
    tableScroll?.update()
  }
  document.body.appendChild(pop)
  activePop = pop
  activePopBtn = btn
  repositionFilterPop()
}
function applyFilter(ti) {
  const table = host.querySelector('table[data-ti="' + ti + '"]')
  if (!table) return
  const cols = filterState[ti] || {}
  table.querySelectorAll('tbody tr').forEach((tr) => {
    let hide = false
    Object.keys(cols).forEach((ci) => {
      const td = tr.children[ci]
      let v = (td?.getAttribute('data-raw') || '').trim()
      if (v === '') v = '(空白)'
      if (cols[ci].has(v)) hide = true
    })
    tr.classList.toggle('km-filtered', hide)
  })
}

// ── layout controls (page width / font size / zoom / line height / para spacing) ──
// Shares the app's apply* (CSS vars on the document root + the full-width body
// class). Values persist via the host (globalState), pushed on every change.
let layoutPop = null
let layoutBtn = null
let sourceBtn = null

function applyLayout(L) {
  applyPageWidth(L.pageWidth)
  applyFontSize(L.fontSize)
  applyZoom(L.zoom)
  applyLineHeight(L.lineHeight)
  applyParagraphSpacing(L.paragraphSpacing)
}
function postLayout() {
  vscode.postMessage({ type: 'layout', layout: layout })
}
function setLayout(key, value) {
  layout = { ...layout, [key]: value }
  applyLayout(layout)
  postLayout()
}

function closeLayoutPop() {
  if (layoutPop) {
    layoutPop.remove()
    layoutPop = null
  }
  if (layoutBtn) layoutBtn.classList.remove('active')
}

// One row: a label, preset chips, and a fine-tune slider. `presets` is an array
// of { label, value }; `value === layout[key]` highlights the chip. `fmt` renders
// the current numeric value. pageWidth is special-cased ('full' has no slider value).
function buildLayoutRow({ label, key, presets, min, max, step, fmt }) {
  const row = document.createElement('div')
  row.className = 'km-lo-row'
  const head = document.createElement('div')
  head.className = 'km-lo-head'
  const lab = document.createElement('span')
  lab.className = 'km-lo-label'
  lab.textContent = label
  const val = document.createElement('span')
  val.className = 'km-lo-val'
  head.append(lab, val)
  row.appendChild(head)

  const chips = document.createElement('div')
  chips.className = 'km-lo-presets'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.className = 'km-lo-slider'
  slider.min = String(min)
  slider.max = String(max)
  slider.step = String(step)

  const sync = () => {
    const cur = layout[key]
    val.textContent = fmt(cur)
    chips.querySelectorAll('.km-lo-chip').forEach((c) => {
      c.classList.toggle('active', String(c.dataset.v) === String(cur))
    })
    if (cur === 'full') {
      slider.disabled = true
      slider.value = String(max)
    } else {
      slider.disabled = false
      slider.value = String(cur)
    }
  }

  presets.forEach((p) => {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'km-lo-chip'
    chip.textContent = p.label
    chip.dataset.v = p.value
    chip.onclick = () => {
      setLayout(key, p.value)
      sync()
    }
    chips.appendChild(chip)
  })
  slider.addEventListener('input', () => {
    setLayout(key, key === 'pageWidth' ? parseInt(slider.value) : parseFloat(slider.value))
    sync()
  })
  row.appendChild(chips)
  row.appendChild(slider)
  sync()
  return row
}

function openLayoutPop() {
  closeFloating()
  const pop = document.createElement('div')
  pop.className = 'km-layout-pop'
  pop.appendChild(
    buildLayoutRow({
      label: t('settings.pageWidth'),
      key: 'pageWidth',
      presets: PAGE_WIDTH_PRESETS.map((p) => ({
        label: t('settings.width.' + p.id),
        value: p.width
      })),
      min: PAGE_WIDTH_MIN,
      max: PAGE_WIDTH_MAX,
      step: 20,
      fmt: (v) => (v === 'full' ? t('settings.width.full') : v + 'px')
    })
  )
  pop.appendChild(
    buildLayoutRow({
      label: t('settings.fontSize'),
      key: 'fontSize',
      presets: FONT_SIZE_PRESETS.map((p) => ({ label: t('settings.font.' + p.id), value: p.size })),
      min: FONT_SIZE_MIN,
      max: FONT_SIZE_MAX,
      step: 1,
      fmt: (v) => v + 'px'
    })
  )
  pop.appendChild(
    buildLayoutRow({
      label: t('settings.zoom'),
      key: 'zoom',
      presets: ZOOM_PRESETS.map((p) => ({ label: Math.round(p.zoom * 100) + '%', value: p.zoom })),
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      step: 0.05,
      fmt: (v) => Math.round(v * 100) + '%'
    })
  )
  pop.appendChild(
    buildLayoutRow({
      label: t('settings.lineHeight'),
      key: 'lineHeight',
      presets: LINE_HEIGHT_PRESETS.map((p) => ({
        label: t('settings.lineHeightPreset.' + p.id),
        value: p.value
      })),
      min: LINE_HEIGHT_MIN,
      max: LINE_HEIGHT_MAX,
      step: 0.05,
      fmt: (v) => Number(v).toFixed(2)
    })
  )
  pop.appendChild(
    buildLayoutRow({
      label: t('settings.paragraphSpacing'),
      key: 'paragraphSpacing',
      presets: PARA_SPACING_PRESETS.map((p) => ({
        label: t('settings.paraSpacingPreset.' + p.id),
        value: p.value
      })),
      min: PARA_SPACING_MIN,
      max: PARA_SPACING_MAX,
      step: 0.1,
      fmt: (v) => Number(v).toFixed(1) + 'em'
    })
  )
  document.body.appendChild(pop)
  layoutPop = pop
  if (layoutBtn) layoutBtn.classList.add('active')
}

function ensureLayoutButton() {
  if (layoutBtn) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'km-layout-btn'
  btn.title = t('settings.layoutLabel')
  btn.setAttribute('aria-label', t('settings.layoutLabel'))
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>'
  btn.onclick = (e) => {
    e.stopPropagation()
    if (layoutPop) closeLayoutPop()
    else openLayoutPop()
  }
  document.body.appendChild(btn)
  layoutBtn = btn
}

// In-editor "source" button: one click back to the text editor (the host reopens
// this file with the default editor). Mirrors the title-bar icon, but on the page.
function ensureSourceButton() {
  if (sourceBtn) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'km-source-btn'
  btn.title = t('mode.source')
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg><span>' +
    escapeHtmlLocal(t('mode.source')) +
    '</span>'
  btn.onclick = () => vscode.postMessage({ type: 'switchToSource' })
  document.body.appendChild(btn)
  sourceBtn = btn
}

// ── links ──
function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
function activateLink(href) {
  if (/^(https?:|mailto:)/i.test(href)) {
    vscode.postMessage({ type: 'openExternal', url: href })
    return
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    vscode.postMessage({ type: 'openExternal', url: href })
    return
  }
  // Relative doc links / pure anchors are deferred in this MVP.
}

// ── event delegation ──
let linkTimer = null
function onDblClick(e) {
  clearTimeout(linkTimer)
  if (e.target.closest('.km-collapse-toggle')) return // a fold toggle, not an edit
  const cell = e.target.closest('td, th')
  if (cell && host.contains(cell) && !e.target.closest('.km-filter-btn')) {
    openCellPop(cell)
    return
  }
  const block = e.target.closest('.km-block')
  if (block && host.contains(block) && block.querySelector(':scope > .km-src-edit')) {
    startBlockEdit(parseInt(block.getAttribute('data-bi')))
  }
}
function onClick(e) {
  const ct = e.target.closest('.km-collapse-toggle')
  if (ct && host.contains(ct)) {
    const head = ct.closest('.km-block[data-hlevel]')
    if (head) toggleSection(head)
    return
  }
  const a = e.target.closest('a')
  if (a && host.contains(a) && !e.shiftKey && (window.getSelection()?.isCollapsed ?? true)) {
    const href = a.getAttribute('href')
    if (href && href !== '#') {
      e.preventDefault()
      clearTimeout(linkTimer)
      linkTimer = setTimeout(() => activateLink(href), 230)
      return
    }
  }
  const se = e.target.closest('.km-src-edit')
  if (se) {
    startBlockEdit(parseInt(se.getAttribute('data-bi')))
    return
  }
  const fb = e.target.closest('.km-filter-btn')
  if (fb) {
    e.stopPropagation()
    if (activePop && activePopBtn === fb) closePop()
    else openFilterPop(fb)
  }
}
function onContextMenu(e) {
  const sel = window.getSelection()
  const hasSel =
    sel && !sel.isCollapsed && host.contains(sel.anchorNode) && host.contains(sel.focusNode)
  const items = []
  if (hasSel) {
    items.push({ label: t('keep.copySel'), fn: () => copySelection(sel) })
  } else {
    const cell = e.target.closest('td, th')
    if (cell && host.contains(cell)) {
      const table = cell.closest('table.km-table')
      if (!table) return
      const ti = parseInt(table.getAttribute('data-ti'))
      const ci = parseInt(cell.getAttribute('data-ci'))
      const isHeader = cell.tagName === 'TH'
      const tr = cell.closest('tr')
      const ri = isHeader ? -1 : parseInt(tr.getAttribute('data-ri'))
      items.push({ label: t('keep.copyCell'), fn: () => copyElement(cell) })
      items.push({ label: t('keep.copyRow'), fn: () => copyRow(tr) })
      items.push({ label: t('keep.copyCol'), fn: () => copyColumn(table, ci) })
      items.push({ label: t('keep.copyTable'), fn: () => copyTable(table) })
      items.push('sep')
      buildTableItems(items, ti, ri, ci, isHeader)
    } else {
      const block = e.target.closest('.km-block')
      if (!block || !host.contains(block)) return
      items.push({ label: t('keep.copy'), fn: () => copyElement(block) })
    }
  }
  if (!items.length) return
  e.preventDefault()
  openMenu(e.clientX, e.clientY, items)
}
function onDocDown(e) {
  if (activePop && !activePop.contains(e.target) && !e.target.classList.contains('km-filter-btn')) {
    closePop()
  }
  if (activeMenu && !activeMenu.contains(e.target)) closeMenu()
  if (
    layoutPop &&
    !layoutPop.contains(e.target) &&
    layoutBtn &&
    !layoutBtn.contains(e.target)
  ) {
    closeLayoutPop()
  }
}
function onEsc(e) {
  if (e.key !== 'Escape') return
  if (activeConfirm) closeConfirm()
  else if (activeMenu) closeMenu()
}
function onScroll() {
  closeMenu()
  repositionCellPop()
  repositionFilterPop()
  tableScroll?.update()
}
function onResize() {
  repositionCellPop()
  repositionFilterPop()
  tableScroll?.update()
}

host.addEventListener('dblclick', onDblClick)
host.addEventListener('click', onClick)
host.addEventListener('contextmenu', onContextMenu)
host.addEventListener('copy', onCopy)
document.addEventListener('click', onDocDown)
document.addEventListener('keydown', onEsc)
window.addEventListener('scroll', onScroll, true)
window.addEventListener('resize', onResize)

// Tell the host we're ready to receive the initial document.
if (!ready) {
  ready = true
  vscode.postMessage({ type: 'ready' })
}
