import { memo, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import {
  renderDoc,
  renderBlockInner,
  renderBlockRange,
  renderTableRows,
  parseDoc,
  toViewLines,
  inline,
  replaceCellInLine,
  insertColumnInLine,
  removeColumnInLine,
  buildTableRow,
  replaceBlockLines,
  toggleTaskLine,
  prepareBlockInsertion,
  detectDocLang
} from '../keep-parser.js'
import { inlineRichStyles } from './editor-copy.js'
import { dirOf } from './editor-images.js'
import { getMermaidSvg, peekMermaidSvg } from './editor-mermaid.js'
import { enhanceKeepTables } from './editor-tablescroll.js'
import { lineColumnAtOffset, lineStartOffset } from '../source-position.js'
import {
  applyKeepHistoryEntry,
  createKeepHistoryEntry,
  createKeepHistoryPatch,
  pushKeepHistory
} from '../keep-history.js'
import ZoomLightbox from './ZoomLightbox.jsx'
import { ensureEmbedZoomButtons, zoomItemFromButton } from './editor-zoom.js'
import { internalLinkTarget, parseInternalDocLink } from '../link-navigation.js'

// Wrapper style for rich-text copy (mirrors the Crepe editor's onCopy payload) so
// pasted output keeps a sensible default font in apps that ignore external CSS.
const COPY_WRAP =
  'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#24292f;'

/**
 * Keep mode (source-backed editing) — the default editor for `.md`.
 *
 * The original file text is the single source of truth (`rawLines`, kept WITH
 * trailing \r). We render it read-only, and editing is location-scoped — a table
 * cell or a block's source — so only the touched lines are rewritten. Nothing
 * else is re-serialized, so saving produces a byte-for-byte diff of exactly the
 * change and nothing more (the "zero diff" requirement for Git-tracked specs).
 *
 * Unlike the Crepe editor this is plain DOM (innerHTML + event delegation) wrapped
 * in a thin React shell — there's no ProseMirror, no document model. After every
 * edit we re-parse rawLines and re-render; filters are re-applied on top.
 *
 * Contract with App:
 *   - initialContent → rawLines on mount. NO initial onChange (that would let the
 *     savedContent baseline be overwritten by a normalized form → spurious diff).
 *   - onChange(rawLines.join('\n'), false) fires ONLY when the user commits an edit.
 *   - onReady({ getMarkdown, getDocHTML, setBlock, clearAllFilters }) — save reads
 *     tab.content, PDF export calls getDocHTML, setBlock is a no-op (no block model
 *     here), and the status bar's filter badge calls clearAllFilters.
 *   - Remount (key includes reloadNonce) re-reads initialContent on external edits.
 */
function KeepEditor({
  inView = true,
  initialContent,
  docPath,
  blankLineSpacing = false,
  onChange,
  onReady,
  onOutline,
  onFilterChange,
  onDraftChange,
  onHistoryChange,
  onCommit,
  onOpenSource,
  onOpenDocLink,
  onFindReferences,
  onRenameHeading,
  sourceSplitMode = false,
  onLocateSource
}) {
  const { t, lang } = useI18n()
  const tRef = useRef(t)
  tRef.current = t
  const blankLineSpacingRef = useRef(blankLineSpacing)
  blankLineSpacingRef.current = blankLineSpacing
  const onOpenSourceRef = useRef(onOpenSource)
  onOpenSourceRef.current = onOpenSource
  const onOpenDocLinkRef = useRef(onOpenDocLink)
  onOpenDocLinkRef.current = onOpenDocLink
  const onFindReferencesRef = useRef(onFindReferences)
  onFindReferencesRef.current = onFindReferences
  const onRenameHeadingRef = useRef(onRenameHeading)
  onRenameHeadingRef.current = onRenameHeading
  const sourceSplitModeRef = useRef(sourceSplitMode)
  sourceSplitModeRef.current = sourceSplitMode
  const onLocateSourceRef = useRef(onLocateSource)
  onLocateSourceRef.current = onLocateSource
  const docPathRef = useRef(docPath)
  docPathRef.current = docPath

  const hostRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)
  // Mutable doc state held in refs (this component drives the DOM directly).
  const rawLinesRef = useRef([]) // \r-inclusive source of truth
  const viewLinesRef = useRef([]) // \r-stripped view (parse/display)
  const blocksRef = useRef([]) // source map from the last render
  const filterStateRef = useRef({}) // tableIdx -> { colIdx: Set(excluded values) }
  const columnStateRef = useRef({}) // tableIdx -> preview-only widths + hidden columns
  const collapsedRef = useRef(new Set()) // collapsed section keys ("level:text"), persisted across re-renders
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onOutlineRef = useRef(onOutline)
  onOutlineRef.current = onOutline
  const onFilterChangeRef = useRef(onFilterChange)
  onFilterChangeRef.current = onFilterChange
  const onDraftChangeRef = useRef(onDraftChange)
  onDraftChangeRef.current = onDraftChange
  const onHistoryChangeRef = useRef(onHistoryChange)
  onHistoryChangeRef.current = onHistoryChange
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const historyRef = useRef({ undo: [], redo: [] })

  // Live edit handles so blur/outside-click can commit/close the right one.
  const activeCellPopRef = useRef(null) // { pop, raw, lineIdx, colIdx } during a cell edit
  const activeBlockEditRef = useRef(null) // { ta, b, originalRaw } during a block source edit
  const activeConfirmRef = useRef(null) // the open "save changes?" modal (custom, not window.confirm)
  const activePopRef = useRef(null) // the open filter dropdown element
  const activePopBtnRef = useRef(null) // the ▼ button that opened it (for toggle)
  const activeMenuRef = useRef(null) // the open table context menu element
  const selectedCellRef = useRef(null) // { ti, ri, ci, isHeader, line } for keyboard table work
  const tableScrollRef = useRef(null) // wide-table top-scrollbar + floating-header handle
  // Tear down every body-appended popover (cell pop / filter pop / table menu /
  // confirm modal). Set inside the mount effect; called when the pane leaves view
  // so a floating edit bar never lingers over another tab's document.
  const suspendFloatingRef = useRef(null)
  const resumeFloatingRef = useRef(null)
  // Re-measure multi-line flags for the whole doc. Set inside the mount effect;
  // called when the pane RE-ENTERS view, since blocks streamed while it was hidden
  // measured 0 height (display:none) and may have missed their km-multiline class.
  const remeasureRef = useRef(null)
  // Full repaint from rawLines. Set inside the mount effect; called when a render
  // OPTION (not the document) changes — only blankLineSpacing so far, which is
  // baked into each block's markup and so can't be re-styled in place.
  const rerenderRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false

    rawLinesRef.current = (initialContent || '').split('\n')
    filterStateRef.current = {}
    columnStateRef.current = {}
    historyRef.current = { undo: [], redo: [] }

    const setDraftActive = (active) => {
      if (destroyed) return
      onDraftChangeRef.current?.(!!active)
    }
    const reportHistory = () => {
      if (destroyed) return
      onHistoryChangeRef.current?.({
        canUndo: historyRef.current.undo.length > 0,
        canRedo: historyRef.current.redo.length > 0,
        undoEntry: historyRef.current.undo.at(-1)?.meta || null,
        redoEntry: historyRef.current.redo.at(-1)?.meta || null
      })
    }
    reportHistory()

    const emitChange = () => {
      if (destroyed) return
      onChangeRef.current?.(rawLinesRef.current.join('\n'), false)
    }

    const applyRawLines = (nextLines, { record = true, emit = true, meta = null } = {}) => {
      const next = Array.isArray(nextLines) ? nextLines : []
      const entry = createKeepHistoryEntry(rawLinesRef.current, next, meta)
      if (!entry) return false
      if (record) {
        historyRef.current.undo = pushKeepHistory(historyRef.current.undo, entry)
        historyRef.current.redo = []
        reportHistory()
      }
      rawLinesRef.current = next
      viewLinesRef.current = toViewLines(next)
      if (emit) emitChange()
      if (record) onCommitRef.current?.(entry)
      return true
    }

    const applyRawPatch = (
      start,
      deleteCount,
      insertedLines,
      { emit = true, meta = null } = {}
    ) => {
      const entry = createKeepHistoryPatch(
        rawLinesRef.current,
        start,
        deleteCount,
        insertedLines,
        meta
      )
      if (!entry) return false
      historyRef.current.undo = pushKeepHistory(historyRef.current.undo, entry)
      historyRef.current.redo = []
      reportHistory()
      rawLinesRef.current.splice(entry.start, entry.before.length, ...entry.after)
      viewLinesRef.current.splice(entry.start, entry.before.length, ...toViewLines(entry.after))
      if (emit) emitChange()
      onCommitRef.current?.(entry)
      return true
    }

    const pushOutline = () => {
      if (!onOutlineRef.current) return
      const heads = blocksRef.current
        .filter((b) => b.type === 'heading')
        .map((b) => ({ level: b.level, text: b.text, bi: b.bi ?? b.start }))
      onOutlineRef.current(heads)
    }

    let afterPaintRaf = 0 // pending requestAnimationFrame id (cancelled on re-render/destroy)
    let embedObserver = null // IntersectionObserver: render mermaid/math only when near view
    let katexPromise = null // lazily-loaded KaTeX module (one import per session)
    const cancelAfterPaint = () => {
      if (afterPaintRaf) {
        cancelAnimationFrame(afterPaintRaf)
        afterPaintRaf = 0
      }
    }

    // ── progressive (chunked) render ──
    // A big doc built in ONE synchronous innerHTML stalls the main thread for a
    // visible beat (tens of thousands of DOM nodes at once). Instead we parse the
    // whole document up front (cheap, and the full block map is needed immediately
    // for the outline / edit indices) but paint it in BLOCK-SIZED chunks: the first
    // chunk synchronously (the top is instantly visible + scrollable), the rest
    // appended across idle frames so the user can read/scroll while it streams in.
    const CHUNK_BLOCKS = 150 // blocks per batch; ≤ this many → one synchronous paint
    const TABLE_INITIAL_ROWS = 80 // enough for an immediately useful first viewport
    const TABLE_ROW_CHUNK = 80 // cap each idle append so one table cannot own a frame
    let chunkToken = 0 // bumped on every rerender/destroy → in-flight chunk steps bail
    let chunkIdle = 0 // pending idle-callback id for the next chunk
    let pendingFrom = 0 // next not-yet-painted block index (Infinity ⇒ fully painted)
    let pendingTableRows = [] // large tables whose remaining <tr>s are still streaming
    let finalizedToken = -1 // table affordances are installed once per render token
    const idle = (fn) =>
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(fn, { timeout: 200 })
        : requestAnimationFrame(() => fn())
    const cancelIdle = (h) =>
      typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : cancelAnimationFrame(h)
    const cancelChunks = () => {
      chunkToken++
      if (chunkIdle) {
        cancelIdle(chunkIdle)
        chunkIdle = 0
      }
    }

    const renderOpts = () => ({
      srcEditLabel: tRef.current('keep.editSource'),
      collapseLabel: tRef.current('keep.toggleSection'),
      filterState: filterStateRef.current,
      baseDir: dirOf(docPathRef.current),
      blankLineSpacing: blankLineSpacingRef.current,
      tableInitialRows: TABLE_INITIAL_ROWS,
      filterLabel: tRef.current('keep.filterColumn'),
      interactiveTasks: true,
      taskToggleLabel: tRef.current('keep.toggleTask')
    })
    // Running table index at the start of each block (tables key filter state by
    // index, so a chunk must continue the count). Rebuilt per render.
    let tableIdxAt = []
    const computeTableIdx = (blocks) => {
      let ti = 0
      tableIdxAt = blocks.map((b) => {
        const cur = ti
        if (b.type === 'table') ti++
        return cur
      })
    }
    const registerPendingTables = (from, to) => {
      for (let bi = from; bi < to; bi++) {
        const block = blocksRef.current[bi]
        if (block?.type !== 'table' || block.dataRows.length <= TABLE_INITIAL_ROWS) continue
        const tableIdx = tableIdxAt[bi]
        const tbody = host.querySelector('table[data-ti="' + tableIdx + '"] > tbody')
        const next = Number(tbody?.dataset.kmRenderedRows)
        if (!tbody || !Number.isFinite(next) || next >= block.dataRows.length) continue
        pendingTableRows.push({ block, tableIdx, tbody, next })
      }
    }
    const hasPendingWork = () => pendingFrom !== Infinity || pendingTableRows.length > 0
    const appendTableRowChunk = (all = false) => {
      const job = pendingTableRows[0]
      if (!job) return
      const from = job.next
      const to = all
        ? job.block.dataRows.length
        : Math.min(from + TABLE_ROW_CHUNK, job.block.dataRows.length)
      job.tbody.insertAdjacentHTML(
        'beforeend',
        renderTableRows(job.block, from, to, dirOf(docPathRef.current))
      )
      job.next = to
      job.tbody.dataset.kmRenderedRows = String(to)
      applyFilterRows(job.tableIdx, Array.from(job.tbody.children).slice(from, to))
      if (to >= job.block.dataRows.length) {
        job.tbody.dataset.kmRenderComplete = 'true'
        pendingTableRows.shift()
      }
    }

    // Full re-render from rawLines (re-parse → chunked paint). Layout-measuring +
    // embed work is pushed PAST each chunk's paint so the doc is visible/scrollable
    // immediately and the main thread stays free for input (hover highlight, caret).
    const rerender = () => {
      if (destroyed) return
      const viewLines = toViewLines(rawLinesRef.current)
      const blocks = parseDoc(viewLines)
      blocks.forEach((b, i) => {
        b.bi = i // tag blocks with their index so the outline / edits can reference them
      })
      blocksRef.current = blocks
      viewLinesRef.current = viewLines
      computeTableIdx(blocks)

      // Route the container to the Chinese/Japanese stack from the document
      // content. Re-evaluated per render, so language-changing edits update it.
      const docLang = detectDocLang(viewLines)
      if (docLang) host.setAttribute('lang', docLang)
      else host.removeAttribute('lang')

      cancelAfterPaint()
      cancelChunks()
      pendingTableRows = []
      const myToken = ++chunkToken
      const total = blocks.length

      if (!total) {
        clearTableSelection()
        host.innerHTML = '<div class="km-empty"></div>'
        pushOutline()
        pendingFrom = Infinity
        finalizedToken = myToken
        tableScrollRef.current?.destroy()
        tableScrollRef.current = null
        onFilterChangeRef.current?.(null)
        return
      }

      const opts = renderOpts()
      const first = Math.min(CHUNK_BLOCKS, total)
      host.innerHTML = renderBlockRange(blocks, viewLines, 0, first, 0, opts).html
      registerPendingTables(0, first)
      pushOutline() // outline comes from the full block map — nav works before full paint
      pendingFrom = first >= total ? Infinity : first
      // Stream remaining document blocks first, then the deferred rows of every
      // large table. Keeping one scheduler preserves source order and guarantees
      // that a giant single-table block never monopolizes the initial paint.
      const step = () => {
        chunkIdle = 0
        if (destroyed || myToken !== chunkToken) return
        if (pendingFrom !== Infinity) {
          const from = pendingFrom
          const to = Math.min(from + CHUNK_BLOCKS, total)
          host.insertAdjacentHTML(
            'beforeend',
            renderBlockRange(blocks, viewLines, from, to, tableIdxAt[from], opts).html
          )
          pendingFrom = to >= total ? Infinity : to
          registerPendingTables(from, to)
          finishRenderRange(from, to)
        } else {
          appendTableRowChunk()
        }
        if (hasPendingWork()) chunkIdle = idle(step)
        else finishDocumentRender()
      }
      // Let Chromium present the initial blocks/rows before any idle append starts.
      cancelAfterPaint()
      afterPaintRaf = requestAnimationFrame(() => {
        afterPaintRaf = 0
        if (destroyed || myToken !== chunkToken) return
        finishRenderRange(0, first)
        if (hasPendingWork()) chunkIdle = idle(step)
        else finishDocumentRender()
      })
    }

    // Synchronously paint every remaining chunk NOW. Called before any operation
    // that needs the WHOLE document in the DOM (outline jump / find / export),
    // which can't wait for the idle stream to finish.
    const flushRemaining = () => {
      if (destroyed || !hasPendingWork()) return
      if (chunkIdle) {
        cancelIdle(chunkIdle)
        chunkIdle = 0
      }
      const blocks = blocksRef.current
      const viewLines = viewLinesRef.current
      const total = blocks.length
      const opts = renderOpts()
      while (pendingFrom < total) {
        const from = pendingFrom
        const to = Math.min(from + CHUNK_BLOCKS, total)
        host.insertAdjacentHTML(
          'beforeend',
          renderBlockRange(blocks, viewLines, from, to, tableIdxAt[from], opts).html
        )
        pendingFrom = to >= total ? Infinity : to
        registerPendingTables(from, to)
        finishRenderRange(from, to)
      }
      pendingFrom = Infinity
      while (pendingTableRows.length) appendTableRowChunk(true)
      finishDocumentRender()
    }

    // Post-paint batch for the blocks in `[from, to)`: layout-dependent + lazy work
    // that needn't block the chunk's paint. Per-chunk work (multiline flags, embed
    // observers, and any active collapse/filter so streamed-in blocks inherit them)
    // runs every block chunk; row chunks apply filters only to their newly added
    // rows. Whole-document affordances are installed by finishDocumentRender().
    const finishRenderRange = (from, to) => {
      if (destroyed) return
      applyMultilineFlagsRange(from, to)
      observeEmbedsRange(from, to)
      if (selectedCellRef.current) restoreSelectedCell()
      // On a fresh open both sets are empty (→ skipped); they matter when a large
      // doc with folded sections / active filters is fully re-rendered after an edit.
      if (collapsedRef.current.size) applyCollapsed()
      const fkeys = Object.keys(filterStateRef.current)
      if (fkeys.length) fkeys.forEach((ti) => applyFilter(parseInt(ti)))
    }
    const finishDocumentRender = () => {
      if (destroyed || finalizedToken === chunkToken) return
      finalizedToken = chunkToken
      reportFilter()
      // Wide-table affordances: the top synced horizontal scrollbar + the
      // viewport-fixed floating header live outside the normal block flow (the
      // float is appended to body), so rebuild them once every table is painted and
      // tear the old ones down first.
      tableScrollRef.current?.destroy()
      tableScrollRef.current = enhanceKeepTables(host, host.closest('.editor-scroll'), {
        columnState: columnStateRef.current,
        t: tRef.current,
        onFilterClick: (clonedBtn) => openFilterPop(clonedBtn),
        // Editing a floating-header cell: resolve the clone to the REAL <th> (same
        // data-line/data-ci → same source line) and edit that, but anchor the
        // editor popup under the clicked clone so it appears where the user clicked.
        onHeaderEdit: (clonedTh) => {
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

    const blockElByBi = (bi) => host.querySelector('.km-block[data-bi="' + bi + '"]')

    // Tag multi-line blocks in `[from, to)` so the edit button pins to the top-right;
    // single-line blocks keep it vertically centered. Primary signal is the source
    // line span; a height check also catches a long single line that wraps. Two
    // phases — read all layout first, THEN write all classes — so writes don't force
    // a reflow on the next read. The font size is uniform across the writing area, so
    // read it ONCE per chunk (not getComputedStyle per block — that per-block style
    // recalc was a chunk of the startup stall on docs with many short blocks).
    const applyMultilineFlagsRange = (from, to) => {
      const candidates = []
      for (let bi = from; bi < to; bi++) {
        const b = blocksRef.current[bi]
        if (!b || b.type === 'table') continue
        const bl = blockElByBi(bi)
        if (!bl) continue
        candidates.push([bl, b])
      }
      // A giant single-table document has no non-table blocks to measure. Avoid
      // even the one computed-style read here: after the table DOM was inserted,
      // that read forces Chromium to synchronously style/layout every cell.
      if (!candidates.length) return
      const baseFs = parseFloat(getComputedStyle(host).fontSize) || 16
      const pending = []
      candidates.forEach(([bl, b]) => {
        let multi = b.end > b.start
        if (!multi) {
          const content = Array.from(bl.children).find((c) => !c.classList.contains('km-src-edit'))
          if (content) multi = content.offsetHeight > baseFs * 2.2
        }
        pending.push([bl, multi])
      })
      pending.forEach(([bl, multi]) => bl.classList.toggle('km-multiline', multi))
    }
    // Single-block variant for scoped restores (one getComputedStyle is fine).
    const applyMultilineForBlock = (bl, b) => {
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

    // ── heading section collapse / expand (display-only; never touches rawLines) ──
    // A heading block carries `data-hlevel`. Collapsing one hides every following
    // block until the next heading of the same or higher level. State is kept as a
    // Set of section keys (so it survives the full re-render an edit triggers) while
    // the live `km-collapsed` class on heading blocks is the source of truth the DOM
    // derives visibility from. Nesting works: a block is hidden if ANY ancestor
    // heading is collapsed (recomputed each time, not cached per block).
    const sectionKey = (headEl) => {
      const lvl = headEl.getAttribute('data-hlevel') || ''
      const h = headEl.querySelector('h1,h2,h3,h4,h5,h6')
      return lvl + ':' + (h ? (h.textContent || '').trim() : '')
    }
    // Re-derive `km-section-hidden` on every block from the `km-collapsed` headings.
    const refreshVisibility = () => {
      const stack = [] // levels of currently-open collapsed ancestor headings
      host.querySelectorAll('.km-block').forEach((el) => {
        const isHeading = el.hasAttribute('data-hlevel')
        const lvl = isHeading ? parseInt(el.getAttribute('data-hlevel')) : null
        if (isHeading) while (stack.length && stack[stack.length - 1] >= lvl) stack.pop()
        el.classList.toggle('km-section-hidden', stack.length > 0)
        if (isHeading && el.classList.contains('km-collapsed')) stack.push(lvl)
      })
    }
    const toggleSection = (headEl) => {
      const collapsed = !headEl.classList.contains('km-collapsed')
      headEl.classList.toggle('km-collapsed', collapsed)
      if (collapsed) collapsedRef.current.add(sectionKey(headEl))
      else collapsedRef.current.delete(sectionKey(headEl))
      refreshVisibility()
      tableScrollRef.current?.update() // hidden/shown tables change the layout
    }
    // Re-apply the persisted collapse state after a full re-render rebuilt the DOM.
    const applyCollapsed = () => {
      host.querySelectorAll('.km-block[data-hlevel]').forEach((el) => {
        el.classList.toggle('km-collapsed', collapsedRef.current.has(sectionKey(el)))
      })
      refreshVisibility()
    }
    // Expand every collapsed ancestor section that hides `el` (an <hN>), so an
    // outline jump to a buried heading can actually scroll to it. The heading's OWN
    // collapse state is left alone (it hides only its children, not itself).
    const revealHeading = (el) => {
      if (!el || !host.contains(el)) return false
      const block = el.closest('.km-block')
      if (!block) return false
      let need = block.hasAttribute('data-hlevel') ? parseInt(block.getAttribute('data-hlevel')) : Infinity
      let node = block.previousElementSibling
      while (node && need > 1) {
        if (node.classList?.contains('km-block') && node.hasAttribute('data-hlevel')) {
          const lvl = parseInt(node.getAttribute('data-hlevel'))
          if (lvl < need) {
            if (node.classList.contains('km-collapsed')) {
              node.classList.remove('km-collapsed')
              collapsedRef.current.delete(sectionKey(node))
            }
            need = lvl
          }
        }
        node = node.previousElementSibling
      }
      refreshVisibility()
      return true
    }

    // ── embeds (mermaid / KaTeX), rendered only when scrolled near view ──
    // renderDoc leaves placeholders; ```mermaid → diagram (async, cached, shared
    // with the rich editor) and $$…$$ → KaTeX. Rendering every diagram on mount was
    // a heavy synchronous chunk on diagram-heavy docs, so an IntersectionObserver
    // defers each one until it's about to scroll into view. `host.contains(el)`
    // guards a late async result whose element a newer re-render already replaced.
    const renderMermaidEl = (el) => {
      const T = tRef.current
      const code = el.getAttribute('data-code') || ''
      const cached = peekMermaidSvg(code)
      if (cached && cached.svg) {
        el.innerHTML = cached.svg
        ensureEmbedZoomButtons(el.parentElement || el, tRef.current)
        return
      }
      el.classList.add('hm-mermaid-hint')
      el.textContent = T('mermaid.rendering')
      getMermaidSvg(code).then((res) => {
        if (destroyed || !host.contains(el)) return
        el.classList.remove('hm-mermaid-hint')
        if (res && res.svg) {
          el.innerHTML = res.svg
          ensureEmbedZoomButtons(el.parentElement || el, tRef.current)
        } else {
          el.classList.add('hm-mermaid-error')
          el.textContent = T('mermaid.error') + ' ' + ((res && res.error) || '')
        }
      })
    }
    const getKatex = () => {
      if (!katexPromise) {
        // KaTeX styles ship with the Crepe theme, which only loads when the rich
        // editor mounts — a keep-only session needs the stylesheet pulled in here.
        import('katex/dist/katex.min.css').catch(() => {})
        katexPromise = import('katex')
          .then((m) => m.default || m)
          .catch(() => null)
      }
      return katexPromise
    }
    const renderMathEl = (el) => {
      getKatex().then((katex) => {
        if (!katex || destroyed || !host.contains(el)) return
        const tex = el.getAttribute('data-tex') || ''
        try {
          katex.render(tex, el, { displayMode: true, throwOnError: false })
          ensureEmbedZoomButtons(el.parentElement || el, tRef.current)
        } catch (e) {
          el.classList.add('hm-mermaid-error')
          el.textContent = String((e && e.message) || e)
        }
      })
    }
    const ensureEmbedObserver = () => {
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
    const observeEmbed = (el) => {
      // An already-rendered (cache hit) diagram paints immediately — no need to wait
      // for it to scroll into view or to flash the "rendering…" hint.
      if (el.classList.contains('km-mermaid')) {
        const cached = peekMermaidSvg(el.getAttribute('data-code') || '')
        if (cached && cached.svg) {
          el.innerHTML = cached.svg
          ensureEmbedZoomButtons(el.parentElement || el, tRef.current)
          return
        }
      }
      ensureEmbedObserver().observe(el)
    }
    const observeEmbeds = (root) => {
      ;(root || host).querySelectorAll('.km-mermaid, .km-math').forEach(observeEmbed)
    }
    // Arm embeds only within the chunk just painted (`[from, to)`) — scanning the
    // whole growing host on every chunk would be O(n²); embeds are appended at the
    // end, so the new ones live under those block indices.
    const observeEmbedsRange = (from, to) => {
      for (let bi = from; bi < to; bi++) {
        const bl = blockElByBi(bi)
        if (bl) bl.querySelectorAll('.km-mermaid, .km-math').forEach(observeEmbed)
      }
    }

    // Tell the parent how many rows survive the active filters (status bar). Only
    // counts tables that actually have a filter applied; null = no filter active.
    // shown/total are the sum across those tables; `tables` carries the per-table
    // breakdown ({ti, shown, total}, ti = document order) for the badge tooltip.
    const reportFilter = () => {
      if (!onFilterChangeRef.current) return
      const tables = []
      host.querySelectorAll('table.km-table').forEach((table) => {
        const ti = table.getAttribute('data-ti')
        const cols = filterStateRef.current[ti]
        if (!cols || Object.keys(cols).length === 0) return
        let total = 0
        let shown = 0
        table.querySelectorAll('tbody tr').forEach((tr) => {
          total++
          if (!tr.classList.contains('km-filtered')) shown++
        })
        tables.push({ ti: parseInt(ti), shown, total })
      })
      if (!tables.length) {
        onFilterChangeRef.current(null)
        return
      }
      onFilterChangeRef.current({
        shown: tables.reduce((s, ft) => s + ft.shown, 0),
        total: tables.reduce((s, ft) => s + ft.total, 0),
        tables
      })
    }

    // ── table cell editing: an enlarged floating editor anchored to the cell ──
    // Rewrites only that one cell on that one raw line on commit. The popover is
    // position:fixed but re-anchored to the cell on scroll/resize so it tracks the
    // cell (instead of drifting over other content) — a roomy textarea for long
    // cells, replacing the cramped single-line input that lived inside the <td>.
    const closeCellPop = (restoreFocus = false) => {
      if (activeCellPopRef.current) {
        activeCellPopRef.current.pop.remove()
        activeCellPopRef.current = null
        setDraftActive(false)
      }
      if (restoreFocus && !destroyed) {
        queueMicrotask(() => {
          const selected = resolveSelection()
          if (!selected || destroyed) return
          selected.focus({ preventScroll: true })
        })
      }
    }
    // Re-place the open editor under its cell; hide it while the cell is scrolled
    // out of the editor's viewport so it never floats over unrelated content.
    const repositionCellPop = () => {
      const cur = activeCellPopRef.current
      if (!cur) return
      const { pop } = cur
      // Anchor to the element the user actually clicked (the floating-header clone
      // when editing from there) so the editor sits under it, even though the edit
      // targets the real cell (`td`).
      const r = (cur.anchor || cur.td).getBoundingClientRect()
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
    // Re-anchor the open filter dropdown under its ▼ header button on scroll/resize
    // (position:fixed → viewport coords), and hide it while the header is scrolled
    // out of the editor's viewport so it stays pinned to the column header.
    const repositionFilterPop = () => {
      const pop = activePopRef.current
      const btn = activePopBtnRef.current
      if (!pop || !btn) return
      const r = btn.getBoundingClientRect()
      pop.style.left = Math.min(r.left, window.innerWidth - 260) + 'px'
      pop.style.top = r.bottom + 4 + 'px'
      const sc = host.closest('.editor-scroll')
      if (sc) {
        const sr = sc.getBoundingClientRect()
        pop.style.visibility = r.bottom < sr.top || r.top > sr.bottom ? 'hidden' : 'visible'
      }
    }
    const commitCellPop = (restoreFocus = true) => {
      const cur = activeCellPopRef.current
      if (!cur) return
      const ta = cur.pop.querySelector('textarea')
      const val = ta ? ta.value.replace(/\n/g, '<br>') : cur.raw
      const td = cur.td
      closeCellPop(restoreFocus)
      if (val === cur.raw) return
      const nextLine = replaceCellInLine(rawLinesRef.current[cur.lineIdx], cur.colIdx, val)
      const tableIdx = Number.parseInt(td?.closest('table')?.getAttribute('data-ti'))
      const rowIdx = Number.parseInt(td?.closest('tr')?.getAttribute('data-ri'))
      applyRawPatch(cur.lineIdx, 1, [nextLine], {
        meta: {
          kind: 'cell',
          target: {
            line: cur.lineIdx + 1,
            table: Number.isFinite(tableIdx) ? tableIdx + 1 : null,
            row: Number.isFinite(rowIdx) ? rowIdx + 1 : null,
            column: cur.colIdx + 1,
            header: td?.tagName === 'TH'
          },
          summaryKey: 'keep.changeCell'
        }
      })
      // Scoped DOM update: a cell edit changes exactly one cell and shifts no line or
      // block index, so repaint just this <td>/<th> instead of rebuilding the whole
      // document. (A full rerender of a 2000-row table for one cell was seconds of
      // jank.) A header cell keeps its filter ▼, so patch only its content span.
      if (td && host.contains(td)) {
        td.setAttribute('data-raw', val)
        const baseDir = dirOf(docPathRef.current) // else a relative image in the cell won't resolve
        if (td.tagName === 'TH') {
          const span = td.querySelector('.km-th-content')
          if (span) span.innerHTML = inline(val, baseDir)
          // Mirror the edit onto the floating-header clone so it stays identical.
          tableScrollRef.current?.refreshContent()
        } else {
          td.innerHTML = inline(val, baseDir)
        }
      } else {
        rerender() // cell somehow detached — fall back to a full re-render
      }
    }
    // ── one edit bar at a time ──
    // Close the open block source editor, optionally committing it. Cancel and
    // commit both re-render (cancel must rebuild the block whose innerHTML we
    // replaced with the textarea); only commit rewrites rawLines first.
    const closeBlockEdit = (commit) => {
      const cur = activeBlockEditRef.current
      if (!cur) return
      activeBlockEditRef.current = null
      setDraftActive(false)
      if (cur.mode === 'insert') {
        if (commit) {
          const inserted = prepareBlockInsertion(rawLinesRef.current, cur.at, cur.ta.value)
          const changed =
            inserted.length > 0 &&
            applyRawPatch(cur.at, 0, inserted, {
              meta: {
                kind: 'block-insert',
                target: { line: cur.at + 1, blockType: 'paragraph' },
                summaryKey: 'keep.changeBlockInsert'
              }
            })
          if (changed) {
            rerender()
            return
          }
        }
        cur.container?.remove()
        return
      }
      if (commit) {
        const { ta, b } = cur
        // Inherit this block's original EOL style (\r presence) so untouched
        // bytes never shift; every replacement line follows the same convention.
        // (Pure helper — see replaceBlockLines in keep-parser.js, unit-tested.)
        applyRawLines(replaceBlockLines(rawLinesRef.current, b.start, b.end, ta.value), {
          meta: {
            kind: 'block',
            target: { line: b.start + 1, blockType: b.type },
            summaryKey: 'keep.changeBlock'
          }
        })
        rerender() // line count may change → indices shift → rebuild the document
        return
      }
      // Clean cancel: nothing changed. Restore just THIS block's DOM (its innerHTML
      // was swapped for the textarea) instead of re-rendering — and re-serializing —
      // the whole document. (Block edits are only on non-table blocks; a no-op cancel
      // on a huge-table doc was the reported 2–3s stall.)
      const b = cur.b
      const bi = b.bi != null ? b.bi : blocksRef.current.indexOf(b)
      const blockDiv = bi >= 0 ? host.querySelector('.km-block[data-bi="' + bi + '"]') : null
      if (blockDiv) {
        blockDiv.innerHTML = renderBlockInner(b, bi, viewLinesRef.current, renderOpts())
        applyMultilineForBlock(blockDiv, b)
        observeEmbeds(blockDiv) // a restored ```mermaid / $$ block re-arms its embed
      } else {
        rerender()
      }
    }
    // Custom "save changes?" modal — deliberately NOT window.confirm. A native
    // dialog leaves the webContents unable to receive keyboard input after it
    // returns, so a textarea opened right after it is dead until reload. This is
    // plain DOM (same channel as the cell pop / context menu), styled like
    // RenameModal. Save = primary (Enter), Esc / click-away = cancel (keep editing).
    const closeConfirm = () => {
      if (activeConfirmRef.current) {
        activeConfirmRef.current.remove()
        activeConfirmRef.current = null
      }
    }
    const showConfirm = (message, { onSave, onDiscard }) => {
      closeConfirm()
      const T = tRef.current
      const wrap = document.createElement('div')
      const backdrop = document.createElement('div')
      backdrop.className = 'menu-backdrop'
      backdrop.style.zIndex = '1400' // above the cell pop / table menu (1300)
      const box = document.createElement('div')
      box.className = 'hm-rename-modal'
      box.style.zIndex = '1401'
      // .hm-rename-modal centers via `transform: translateX(-50%)`, but its default
      // `menuFadeIn` animation also sets `transform: scale(...)`, which overrides the
      // centering for the animation's duration then snaps back → a sideways jump.
      // Use an opacity-only fade so the centering transform is never clobbered.
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
      discard.textContent = T('keep.editDiscardBtn')
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = T('edit.cancel')
      const save = document.createElement('button')
      save.type = 'button'
      save.className = 'primary'
      save.textContent = T('keep.editSaveBtn')
      // Order: save (primary) → discard → cancel.
      actions.append(save, discard, cancel)
      box.append(title, actions)
      wrap.append(backdrop, box)
      document.body.appendChild(wrap)
      activeConfirmRef.current = wrap
      const done = (fn) => () => {
        closeConfirm()
        fn?.()
      }
      backdrop.onclick = done(null) // click-away = cancel (do nothing, keep editing)
      cancel.onclick = done(null)
      discard.onclick = done(onDiscard)
      save.onclick = done(onSave)
      // preventScroll: a plain focus() would scrollIntoView the button, scrolling
      // the editor behind it and toggling a scrollbar → the centered modal jumps.
      save.focus({ preventScroll: true })
    }
    // Enforce "one edit bar": close whatever editor is open, then build the new
    // one. A clean editor closes silently; a dirty one prompts (save / discard /
    // cancel). Closing re-renders the doc (except a clean cell pop), so the build
    // re-resolves any DOM it captured — see the open helpers.
    const openAfterClose = (build) => {
      const cell = activeCellPopRef.current
      const blk = activeBlockEditRef.current
      if (!cell && !blk) return build()
      const msg = tRef.current('confirm.keepEditSave')
      if (cell) {
        const ta = cell.pop.querySelector('textarea')
        const val = ta ? ta.value.replace(/\n/g, '<br>') : cell.raw
        if (val === cell.raw) {
          closeCellPop(false) // clean: no re-render, captured td still valid
          return build()
        }
        return showConfirm(msg, {
          onSave: () => {
            commitCellPop(false)
            build()
          },
          onDiscard: () => {
            closeCellPop(false)
            build()
          }
        })
      }
      if (blk.ta.value === blk.originalRaw) {
        closeBlockEdit(false) // clean discard still re-renders to restore the block
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

    const openCellPop = (td, anchor) =>
      openAfterClose(() => {
        if (destroyed) return
        // A commit re-rendered the doc → the original cell is detached; re-resolve.
        // Match both <td> (body) and <th> (header) — headers are editable too.
        if (!host.contains(td)) {
          const lineAttr = td.getAttribute('data-line')
          const ciAttr = td.getAttribute('data-ci')
          const sel =
            'td[data-line="' + lineAttr + '"][data-ci="' + ciAttr + '"],' +
            'th[data-line="' + lineAttr + '"][data-ci="' + ciAttr + '"]'
          td = host.querySelector(sel)
          if (!td) return
        }
        const T = tRef.current
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
        ok.textContent = T('keep.editConfirmKey')
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = T('edit.cancel')
        // Confirm first, cancel after — same button order as the block source editor.
        act.appendChild(ok)
        act.appendChild(cancel)
        pop.appendChild(ta)
        pop.appendChild(act)
        document.body.appendChild(pop)
        // `anchor` is the (possibly floating-header) element to position under; it
        // falls back to the real cell. Re-resolve it too if it got detached.
        const anchorEl = anchor && anchor.isConnected ? anchor : td
        activeCellPopRef.current = { pop, td, anchor: anchorEl, raw, lineIdx, colIdx }
        setDraftActive(true)
        repositionCellPop() // anchor below the cell, flip/clamp to stay on screen
        ta.focus()
        ta.select()
        // Ctrl/Cmd+Enter commits; a plain Enter inserts a newline (cells can be
        // multi-line, serialized back as <br>). Esc cancels.
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeCellPop(true)
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            commitCellPop()
          }
        })
        cancel.onclick = () => closeCellPop(true)
        ok.onclick = () => commitCellPop()
      })

    // ── block "edit source": swap a non-table block's raw lines via a textarea ──
    const startBlockEdit = (bi) =>
      openAfterClose(() => {
        // only one edit bar at a time; openAfterClose re-renders on a save, so
        // resolve the block fresh here (not before the close).
        if (destroyed) return
        const b = blocksRef.current[bi]
        if (!b) return
        const blockDiv = host.querySelector('.km-block[data-bi="' + bi + '"]')
        if (!blockDiv) return
        const raw = viewLinesRef.current.slice(b.start, b.end + 1).join('\n')
        const ta = document.createElement('textarea')
        ta.className = 'km-src-editor'
        ta.value = raw
        ta.rows = Math.min(20, raw.split('\n').length + 1)
        const act = document.createElement('div')
        act.className = 'km-src-actions'
        const ok = document.createElement('button')
        ok.type = 'button'
        ok.className = 'ok'
        ok.textContent = tRef.current('keep.editConfirmKey')
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = tRef.current('edit.cancel')
        act.appendChild(ok)
        act.appendChild(cancel)
        blockDiv.innerHTML = ''
        blockDiv.appendChild(ta)
        blockDiv.appendChild(act)
        ta.focus()
        activeBlockEditRef.current = { ta, b, originalRaw: raw }
        setDraftActive(true)
        // Ctrl/Cmd+Enter commits; a plain Enter stays a newline (block source is
        // multi-line). Esc cancels.
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeBlockEdit(false)
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            closeBlockEdit(true)
          }
        })
        cancel.onclick = () => closeBlockEdit(false)
        ok.onclick = () => closeBlockEdit(true)
      })

    const startBlockInsert = (bi, where) =>
      openAfterClose(() => {
        if (destroyed) return
        const b = blocksRef.current[bi]
        if (!b || b.type === 'table' || b.type === 'frontmatter') return
        const blockDiv = host.querySelector('.km-block[data-bi="' + bi + '"]')
        if (!blockDiv) return
        const container = document.createElement('div')
        container.className = 'km-block km-block-insert'
        const ta = document.createElement('textarea')
        ta.className = 'km-src-editor'
        ta.rows = 4
        ta.placeholder = tRef.current('keep.insertBlockPlaceholder')
        ta.setAttribute('aria-label', tRef.current('keep.insertBlockLabel'))
        const actions = document.createElement('div')
        actions.className = 'km-src-actions'
        const ok = document.createElement('button')
        ok.type = 'button'
        ok.className = 'ok'
        ok.textContent = tRef.current('keep.editConfirmKey')
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = tRef.current('edit.cancel')
        actions.append(ok, cancel)
        container.append(ta, actions)
        const at = where === 'above' ? b.start : b.end + 1
        if (where === 'above') blockDiv.before(container)
        else blockDiv.after(container)
        activeBlockEditRef.current = {
          mode: 'insert',
          ta,
          b,
          at,
          container,
          originalRaw: ''
        }
        setDraftActive(true)
        ta.focus()
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeBlockEdit(false)
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            closeBlockEdit(true)
          }
        })
        cancel.onclick = () => closeBlockEdit(false)
        ok.onclick = () => closeBlockEdit(true)
      })

    const structuralBlock = (bi) => {
      const b = blocksRef.current[bi]
      return b && b.type !== 'table' && b.type !== 'frontmatter' ? b : null
    }
    const duplicateBlock = (bi) => {
      const b = structuralBlock(bi)
      if (!b) return false
      const inserted = prepareBlockInsertion(
        rawLinesRef.current,
        b.end + 1,
        rawLinesRef.current.slice(b.start, b.end + 1)
      )
      const changed = applyRawPatch(b.end + 1, 0, inserted, {
        meta: {
          kind: 'block-duplicate',
          target: { line: b.start + 1, blockType: b.type },
          summaryKey: 'keep.changeBlockDuplicate'
        }
      })
      if (changed) rerender()
      return changed
    }
    const deleteBlock = (bi) => {
      const b = structuralBlock(bi)
      if (!b) return false
      const changed = applyRawPatch(b.start, b.end - b.start + 1, [], {
        meta: {
          kind: 'block-delete',
          target: { line: b.start + 1, blockType: b.type },
          summaryKey: 'keep.changeBlockDelete'
        }
      })
      if (changed) rerender()
      return changed
    }
    const performBlockCommand = (command, requestedBi) => {
      const bi = Number.isInteger(requestedBi) ? requestedBi : lastInteractedBi
      if (!structuralBlock(bi)) return false
      if (command === 'insertAbove' || command === 'insertBelow') {
        startBlockInsert(bi, command === 'insertAbove' ? 'above' : 'below')
        return true
      }
      if (command === 'duplicate') {
        openAfterClose(() => duplicateBlock(bi))
        return true
      }
      if (command === 'delete') {
        openAfterClose(() => deleteBlock(bi))
        return true
      }
      return false
    }

    const toggleTaskAt = (lineIdx, checked) => {
      const current = rawLinesRef.current[lineIdx]
      const next = toggleTaskLine(current, checked)
      if (next === current) return false
      const changed = applyRawPatch(lineIdx, 1, [next], {
        meta: {
          kind: 'task',
          target: { line: lineIdx + 1, blockType: 'task' },
          summaryKey: checked ? 'keep.changeTaskDone' : 'keep.changeTaskOpen'
        }
      })
      if (changed) rerender()
      return changed
    }

    // ── structural table edits: add / remove rows & columns ──
    // Each rewrites only lines within the table's range, then re-parses. The
    // ti → table-block lookup is resolved fresh at call time (line indices shift
    // after a structural edit, so we never cache a stale block).
    const getTable = (ti) => blocksRef.current.filter((b) => b.type === 'table')[ti]

    const doInsertRow = (ti, ri, where) => {
      const b = getTable(ti)
      if (!b) return
      let at
      if (where === 'first') at = b.sepLine + 1
      else if (where === 'above') at = b.dataRows[ri]?.lineIdx
      else at = (b.dataRows[ri]?.lineIdx ?? b.sepLine) + 1
      if (at == null) return
      const row = buildTableRow(b.headers.length, rawLinesRef.current[b.headerLine] || '')
      applyRawPatch(at, 0, [row], {
        meta: {
          kind: 'row-insert',
          target: { line: at + 1, table: ti + 1, row: ri + 1 },
          summaryKey: 'keep.changeRowInsert',
          summaryVars: { n: 1 }
        }
      })
      rerender()
    }
    const doDeleteRow = (ti, ri) => {
      const b = getTable(ti)
      if (!b) return
      const dr = b.dataRows[ri]
      if (!dr) return
      applyRawPatch(dr.lineIdx, 1, [], {
        meta: {
          kind: 'row-delete',
          target: { line: dr.lineIdx + 1, table: ti + 1, row: ri + 1 },
          summaryKey: 'keep.changeRowDelete',
          summaryVars: { n: 1 }
        }
      })
      rerender()
    }
    const doInsertColumn = (ti, colIdx) => {
      const b = getTable(ti)
      if (!b) return
      const nextLines = rawLinesRef.current.slice(b.start, b.end + 1)
      for (let ln = 0; ln < nextLines.length; ln++) {
        nextLines[ln] = insertColumnInLine(
          nextLines[ln],
          colIdx,
          b.start + ln === b.sepLine ? '---' : ''
        )
      }
      delete filterStateRef.current[ti] // column indices shifted — drop stale filters
      delete columnStateRef.current[ti] // manual widths / hidden indices shifted too
      applyRawPatch(b.start, b.end - b.start + 1, nextLines, {
        meta: {
          kind: 'column-insert',
          target: { line: b.start + 1, table: ti + 1, column: colIdx + 1 },
          summaryKey: 'keep.changeColumnInsert',
          summaryVars: { n: 1 }
        }
      })
      rerender()
    }
    const doDeleteColumn = (ti, colIdx) => {
      const b = getTable(ti)
      if (!b || b.headers.length <= 1) return // never delete the last column
      const nextLines = rawLinesRef.current.slice(b.start, b.end + 1)
      for (let ln = 0; ln < nextLines.length; ln++) {
        nextLines[ln] = removeColumnInLine(nextLines[ln], colIdx)
      }
      delete filterStateRef.current[ti] // column indices shifted — drop stale filters
      delete columnStateRef.current[ti] // manual widths / hidden indices shifted too
      applyRawPatch(b.start, b.end - b.start + 1, nextLines, {
        meta: {
          kind: 'column-delete',
          target: { line: b.start + 1, table: ti + 1, column: colIdx + 1 },
          summaryKey: 'keep.changeColumnDelete',
          summaryVars: { n: 1 }
        }
      })
      rerender()
    }

    const closeMenu = () => {
      if (activeMenuRef.current) {
        activeMenuRef.current.remove()
        activeMenuRef.current = null
      }
    }
    // Build a context menu from an items array ({label, fn, disabled} | 'sep').
    const openMenu = (x, y, items) => {
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
      activeMenuRef.current = menu
    }
    // Table-specific row/column entries, appended to a menu's items array.
    const buildTableItems = (items, ti, ri, ci, isHeader) => {
      const T = tRef.current
      const b = getTable(ti)
      if (isHeader) {
        items.push({ label: T('keep.rowInsertFirst'), fn: () => doInsertRow(ti, ri, 'first') })
      } else {
        items.push({ label: T('keep.rowInsertAbove'), fn: () => doInsertRow(ti, ri, 'above') })
        items.push({ label: T('keep.rowInsertBelow'), fn: () => doInsertRow(ti, ri, 'below') })
      }
      items.push('sep')
      items.push({ label: T('keep.colInsertLeft'), fn: () => doInsertColumn(ti, ci) })
      items.push({ label: T('keep.colInsertRight'), fn: () => doInsertColumn(ti, ci + 1) })
      items.push('sep')
      items.push({
        label: T('keep.autoFitColumn'),
        fn: () => tableScrollRef.current?.autoFitColumn(ti, ci)
      })
      items.push({
        label: T('keep.tableAutoFit'),
        fn: () => tableScrollRef.current?.autoFitTable(ti)
      })
      const columnName = (b?.headers[ci] || '').trim() || T('keep.columnNumber', { number: ci + 1 })
      items.push({
        label: T('keep.hideColumn', { name: columnName }),
        fn: () => tableScrollRef.current?.hideColumn(ti, ci),
        disabled: !tableScrollRef.current?.canHideColumn(ti, ci)
      })
      items.push('sep')
      if (!isHeader) items.push({ label: T('keep.rowDelete'), fn: () => doDeleteRow(ti, ri) })
      items.push({
        label: T('keep.colDelete'),
        fn: () => doDeleteColumn(ti, ci),
        disabled: !b || b.headers.length <= 1
      })
      items.push('sep')
      items.push({
        label: T('keep.clearTableFilter'),
        fn: () => clearTableFilter(ti),
        disabled: !tableHasFilter(ti)
      })
    }

    // ── table cell selection + keyboard command model ──
    // Keep a small logical coordinate instead of a DOM node so a structural edit
    // can rebuild the table without retaining a detached cell.
    const selectionForCell = (cell) => {
      const table = cell?.closest?.('table.km-table')
      if (!table || !host.contains(table)) return null
      const isHeader = cell.tagName === 'TH'
      const row = cell.closest('tr')
      return {
        ti: parseInt(table.getAttribute('data-ti')),
        ri: isHeader ? -1 : parseInt(row?.getAttribute('data-ri')),
        ci: parseInt(cell.getAttribute('data-ci')),
        isHeader,
        line: parseInt(cell.getAttribute('data-line'))
      }
    }
    const resolveSelection = (selection = selectedCellRef.current) => {
      if (!selection || !Number.isFinite(selection.ti) || !Number.isFinite(selection.ci)) {
        return null
      }
      const rowSelector = selection.isHeader
        ? 'thead tr'
        : `tbody tr[data-ri="${selection.ri}"]`
      return host.querySelector(
        `table.km-table[data-ti="${selection.ti}"] ${rowSelector} > ` +
          `${selection.isHeader ? 'th' : 'td'}[data-ci="${selection.ci}"]`
      )
    }
    const clearTableSelection = ({ focusTable = false } = {}) => {
      const cell = resolveSelection()
      const table = cell?.closest('table.km-table')
      if (cell) {
        cell.classList.remove('km-cell-selected')
        cell.removeAttribute('aria-selected')
        cell.removeAttribute('aria-label')
        cell.tabIndex = -1
      }
      selectedCellRef.current = null
      if (table) {
        table.tabIndex = 0
        if (focusTable) table.focus({ preventScroll: true })
      }
    }
    const tableItemsForCell = (cell) => {
      const table = cell?.closest('table.km-table')
      if (!table) return []
      const selection = selectionForCell(cell)
      if (!selection) return []
      const tr = cell.closest('tr')
      const T = tRef.current
      const items = [
        { label: T('keep.copyCell'), fn: () => copyElement(cell) },
        { label: T('keep.copyRow'), fn: () => copyRow(tr) },
        { label: T('keep.copyCol'), fn: () => copyColumn(table, selection.ci) },
        { label: T('keep.copyTable'), fn: () => copyTable(table) }
      ]
      if (Number.isFinite(selection.line)) {
        items.push({ label: T('keep.openSource'), fn: () => openSourceAt(selection.line) })
      }
      items.push('sep')
      buildTableItems(
        items,
        selection.ti,
        selection.ri,
        selection.ci,
        selection.isHeader
      )
      return items
    }
    function performTableCommand(command) {
      const cell = resolveSelection()
      const selection = selectionForCell(cell)
      if (!cell || !selection) return false
      const table = cell.closest('table.km-table')
      const headerFilter = table.querySelector(
        `.km-filter-btn[data-ci="${selection.ci}"]`
      )
      if (command === 'edit') openCellPop(cell)
      else if (command === 'filter') {
        if (!headerFilter) return false
        openFilterPop(headerFilter)
      } else if (command === 'menu') {
        const rect = cell.getBoundingClientRect()
        openMenu(rect.left + 8, rect.bottom + 4, tableItemsForCell(cell))
      } else if (command === 'rowAbove') {
        doInsertRow(selection.ti, selection.ri, selection.isHeader ? 'first' : 'above')
      } else if (command === 'rowBelow') {
        doInsertRow(selection.ti, selection.ri, selection.isHeader ? 'first' : 'below')
      } else if (command === 'rowDelete') {
        if (selection.isHeader) return false
        doDeleteRow(selection.ti, selection.ri)
      } else if (command === 'colLeft') doInsertColumn(selection.ti, selection.ci)
      else if (command === 'colRight') doInsertColumn(selection.ti, selection.ci + 1)
      else if (command === 'colDelete') doDeleteColumn(selection.ti, selection.ci)
      else return false
      return true
    }
    const selectCell = (cell, { focus = true, scroll = false } = {}) => {
      const next = selectionForCell(cell)
      if (!next) return false
      const previous = resolveSelection()
      if (previous && previous !== cell) {
        previous.classList.remove('km-cell-selected')
        previous.removeAttribute('aria-selected')
        previous.removeAttribute('aria-label')
        previous.tabIndex = -1
      }
      selectedCellRef.current = next
      const table = cell.closest('table.km-table')
      table.tabIndex = -1
      table.setAttribute(
        'aria-label',
        tRef.current('keep.tableAria', { n: next.ti + 1 })
      )
      cell.classList.add('km-cell-selected')
      cell.setAttribute('aria-selected', 'true')
      cell.setAttribute(
        'aria-label',
        tRef.current('keep.cellAria', {
          row: next.isHeader ? 1 : next.ri + 2,
          column: next.ci + 1,
          value: cell.getAttribute('data-raw') || ''
        })
      )
      cell.tabIndex = 0
      if (focus) cell.focus({ preventScroll: true })
      if (scroll && !tableScrollRef.current?.revealCell(cell)) {
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
      return true
    }
    const restoreSelectedCell = () => {
      const cell = resolveSelection()
      if (!cell) {
        clearTableSelection()
        return false
      }
      if (cell.classList.contains('km-cell-selected')) return true
      return selectCell(cell, { focus: false })
    }
    const visibleCellInRow = (row, startCi, delta) => {
      if (!row) return null
      for (let ci = startCi; ci >= 0 && ci < row.children.length; ci += delta) {
        const cell = row.children[ci]
        if (!cell.classList.contains('km-col-hidden')) return cell
      }
      return null
    }
    const adjacentVisibleRow = (table, row, delta) => {
      let next = delta > 0 ? row.nextElementSibling : row.previousElementSibling
      if (!next) {
        if (delta > 0 && row.parentElement?.tagName === 'THEAD') {
          next = table.tBodies[0]?.firstElementChild || null
        } else if (delta < 0 && row.parentElement?.tagName === 'TBODY') {
          next = table.tHead?.rows?.[0] || null
        }
      }
      while (next?.classList.contains('km-filtered')) {
        next = delta > 0 ? next.nextElementSibling : next.previousElementSibling
      }
      return next
    }
    const moveSelectedCell = (direction) => {
      const cell = resolveSelection()
      if (!cell) return false
      const table = cell.closest('table.km-table')
      const row = cell.closest('tr')
      const ci = parseInt(cell.getAttribute('data-ci'))
      let target = null
      if (direction === 'left') target = visibleCellInRow(row, ci - 1, -1)
      else if (direction === 'right') target = visibleCellInRow(row, ci + 1, 1)
      else {
        const delta = direction === 'up' || direction === 'previous' ? -1 : 1
        if (direction === 'previous') {
          target = visibleCellInRow(row, ci - 1, -1)
          if (!target) {
            const nextRow = adjacentVisibleRow(table, row, delta)
            target = visibleCellInRow(nextRow, nextRow?.children.length - 1, -1)
          }
        } else if (direction === 'next') {
          target = visibleCellInRow(row, ci + 1, 1)
          if (!target) {
            const nextRow = adjacentVisibleRow(table, row, delta)
            target = visibleCellInRow(nextRow, 0, 1)
          }
        } else {
          const nextRow = adjacentVisibleRow(table, row, delta)
          target = nextRow?.children[ci] || null
          if (target?.classList.contains('km-col-hidden')) target = null
        }
      }
      return target ? selectCell(target, { scroll: true }) : false
    }
    const pasteIntoSelectedCells = (event) => {
      if (activeCellPopRef.current || activeBlockEditRef.current) return false
      const cell = resolveSelection()
      const selection = selectionForCell(cell)
      if (!cell || !selection) return false
      const text = event.clipboardData?.getData('text/plain')
      if (text == null || text === '') return false
      const rows = text.replace(/\r\n?/g, '\n').split('\n')
      if (rows.length > 1 && rows.at(-1) === '') rows.pop()
      const matrix = rows.map((row) => row.split('\t'))
      const table = getTable(selection.ti)
      if (!table || !matrix.length) return false
      const startGridRow = selection.isHeader ? 0 : selection.ri + 1
      const maxGridRows = table.dataRows.length + 1
      const maxColumns = table.headers.length
      const changed = new Map()
      let appliedRows = 0
      let appliedColumns = 0
      let clipped = false

      matrix.forEach((values, rowOffset) => {
        const gridRow = startGridRow + rowOffset
        if (gridRow >= maxGridRows) {
          clipped = true
          return
        }
        const lineIdx = gridRow === 0 ? table.headerLine : table.dataRows[gridRow - 1]?.lineIdx
        if (!Number.isFinite(lineIdx)) return
        let line = changed.get(lineIdx) ?? rawLinesRef.current[lineIdx]
        let rowApplied = false
        values.forEach((value, colOffset) => {
          const colIdx = selection.ci + colOffset
          if (colIdx >= maxColumns) {
            clipped = true
            return
          }
          line = replaceCellInLine(line, colIdx, value.replace(/\n/g, '<br>'))
          appliedColumns = Math.max(appliedColumns, colOffset + 1)
          rowApplied = true
        })
        if (rowApplied) {
          changed.set(lineIdx, line)
          appliedRows = Math.max(appliedRows, rowOffset + 1)
        }
      })
      if (!changed.size) return false
      const lineNumbers = [...changed.keys()].sort((a, b) => a - b)
      const start = lineNumbers[0]
      const end = lineNumbers.at(-1)
      const nextLines = rawLinesRef.current.slice(start, end + 1)
      lineNumbers.forEach((lineIdx) => {
        nextLines[lineIdx - start] = changed.get(lineIdx)
      })
      event.preventDefault()
      applyRawPatch(start, end - start + 1, nextLines, {
        meta: {
          kind: 'paste',
          target: {
            line: selection.line + 1,
            table: selection.ti + 1,
            row: startGridRow + 1,
            column: selection.ci + 1
          },
          summaryKey: clipped ? 'keep.changePasteClipped' : 'keep.changePaste',
          summaryVars: { rows: appliedRows, columns: appliedColumns }
        }
      })
      rerender()
      return true
    }

    // ── rich-text copy & "open source here" (general right-click / Ctrl+C) ──
    // The single source of truth is rawLines; "open source here" hands the parent
    // a 0-based source line so it can flip global source mode and place the caret.
    const lineForBlock = (block) => {
      if (!block) return 0
      const bi = parseInt(block.getAttribute('data-bi'))
      const b = blocksRef.current[bi]
      return b ? b.start : 0
    }
    const blockOfNode = (node) => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement)
      return el && host.contains(el) ? el.closest('.km-block') : null
    }
    const currentSelectionRange = () => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) return null
      const range = selection.getRangeAt(0)
      if (!host.contains(range.startContainer) || !host.contains(range.endContainer)) return null
      return range
    }
    const selectionLineRange = () => {
      const range = currentSelectionRange()
      if (!range) return null
      const startBlock = blockOfNode(range.startContainer)
      const endBlock = blockOfNode(range.endContainer)
      const startBi = Number(startBlock?.getAttribute('data-bi'))
      const endBi = Number(endBlock?.getAttribute('data-bi'))
      const start = blocksRef.current[startBi]?.start
      const end = blocksRef.current[endBi]?.end
      return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null
    }
    const openSourceAt = (lineIdx) => {
      closeMenu()
      onOpenSourceRef.current?.(lineIdx)
    }
    // Low-level: put a rich (html) + plain payload on the clipboard.
    const writeClipboard = (html, plain) => {
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
    // Clone a node, drop editor-only chrome, inline styles → { html, text }.
    const richHtml = (node) => {
      const wrap = document.createElement('div')
      wrap.appendChild(node)
      wrap.querySelectorAll('.km-src-edit, .km-filter-btn, button').forEach((el) => el.remove())
      inlineRichStyles(wrap)
      return { html: `<div style="${COPY_WRAP}">${wrap.innerHTML}</div>`, text: wrap.textContent || '' }
    }
    const writeRich = (node, plain) => {
      const r = richHtml(node)
      writeClipboard(r.html, plain != null ? plain : r.text)
    }
    const copyElement = (el) => writeRich(el.cloneNode(true))
    const copySelection = (sel) => {
      try {
        writeRich(sel.getRangeAt(0).cloneContents(), sel.toString())
      } catch {
        /* nothing meaningful selected */
      }
    }
    // ── table copy: cell / row / column / whole table ──
    // Plain text is TSV so it lands in a spreadsheet grid; the HTML carries a real
    // <table> so Excel/Word paste keeps the grid (not one crammed cell).
    const cellPlain = (c) => {
      if (!c) return ''
      const cl = c.cloneNode(true)
      cl.querySelectorAll('.km-filter-btn').forEach((el) => el.remove())
      cl.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
      return (cl.textContent || '').trim()
    }
    const wrapRows = (rows) => {
      // rows: array of <tr> clones → a standalone <table> for rich paste.
      const t = document.createElement('table')
      const tb = document.createElement('tbody')
      rows.forEach((tr) => tb.appendChild(tr))
      t.appendChild(tb)
      return t
    }
    const copyTable = (table) => {
      flushRemaining()
      const rows = [...table.querySelectorAll('tr')]
      const tsv = rows.map((tr) => [...tr.children].map(cellPlain).join('\t')).join('\n')
      writeRich(table.cloneNode(true), tsv)
    }
    const copyRow = (tr) => {
      const tsv = [...tr.children].map(cellPlain).join('\t')
      writeRich(wrapRows([tr.cloneNode(true)]), tsv)
    }
    const copyColumn = (table, ci) => {
      flushRemaining()
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
    // Ctrl/Cmd+C over a drag selection → rich HTML, not just plain text.
    const onCopy = (e) => {
      if (activeCellPopRef.current) return // editing a cell: let the textarea copy
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
        /* fall back to default copy */
      }
    }

    // ── Excel-style column filter (display only — never touches rawLines) ──
    const closePop = () => {
      if (activePopRef.current) {
        activePopRef.current.remove()
        activePopRef.current = null
      }
      activePopBtnRef.current = null
    }
    const openFilterPop = (btn) => {
      // Filter value enumeration is a whole-table operation. If the user opens it
      // while rows are still streaming, finish them first so no values are omitted.
      flushRemaining()
      closePop()
      const ti = parseInt(btn.getAttribute('data-ti'))
      const ci = parseInt(btn.getAttribute('data-ci'))
      const table = host.querySelector('table[data-ti="' + ti + '"]')
      if (!table) return
      filterStateRef.current[ti] = filterStateRef.current[ti] || {}
      const tState = filterStateRef.current[ti]
      const excluded = tState[ci] || new Set()
      const cellVal = (tr, c) => {
        const v = (tr.children[c]?.getAttribute('data-raw') || '').trim()
        return v === '' ? '(空白)' : v
      }
      // Excel semantics: list only values from rows that survive the OTHER
      // columns' filters — filtering B after A offers just A's survivors. This
      // column's own filter is ignored so its currently-excluded values stay
      // listed (otherwise they could never be re-checked).
      const valueCounts = new Map()
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const hidden = Object.keys(tState).some(
          (c) => parseInt(c) !== ci && tState[c].has(cellVal(tr, c))
        )
        if (!hidden) {
          const value = cellVal(tr, ci)
          valueCounts.set(value, (valueCounts.get(value) || 0) + 1)
        }
      })
      const values = new Set(valueCounts.keys())

      const pop = document.createElement('div')
      pop.className = 'km-filter-pop'
      pop.innerHTML =
        '<input class="km-fp-search" placeholder="' +
        escapeAttrLocal(tRef.current('keep.filterSearch')) +
        '">' +
        '<div class="km-fp-tools"><a data-all="1">' +
        escapeHtmlLocal(tRef.current('keep.selectAll')) +
        '</a><a data-all="0">' +
        escapeHtmlLocal(tRef.current('keep.selectNone')) +
        '</a></div>' +
        '<div class="km-fp-list"></div>' +
        // Confirm first, cancel after — matches the cell / block source editors.
        '<div class="km-fp-actions"><button type="button" class="ok">' +
        escapeHtmlLocal(tRef.current('edit.confirm')) +
        '</button><button type="button" class="cancel">' +
        escapeHtmlLocal(tRef.current('edit.cancel')) +
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
            span.className = 'km-fp-value'
            span.innerHTML = inline(v)
            const count = document.createElement('span')
            count.className = 'km-fp-count'
            count.textContent = `(${valueCounts.get(v)})`
            lab.appendChild(cb)
            lab.appendChild(span)
            lab.appendChild(count)
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
        // Excel-style: the search box narrows the visible list; confirming keeps
        // only the values that are BOTH visible (match the search) AND checked,
        // and excludes everything else. So typing a search term and confirming
        // filters the table down to the matching rows. (Previously the hidden,
        // non-matching values were silently kept unless already excluded, so a
        // search-then-confirm with no manual unchecking did nothing.)
        const keep = new Set(
          [...list.querySelectorAll('input')]
            .filter((cb) => cb.checked)
            .map((cb) => cb.dataset.v)
        )
        // Values whose rows are hidden by OTHER columns' filters aren't listed,
        // so they can't be toggled here — carry their exclusion over unchanged.
        const ex = new Set([...excluded].filter((v) => !values.has(v)))
        sorted.forEach((v) => {
          if (!keep.has(v)) ex.add(v)
        })
        if (ex.size > 0) filterStateRef.current[ti][ci] = ex
        else delete filterStateRef.current[ti][ci]
        closePop()
        // A filter only toggles row visibility — it never touches rawLines or block
        // structure. Apply it directly instead of a full re-render (rebuilding a
        // huge table just to hide a few rows was needless seconds of work), and sync
        // the ▼ button's active state since renderTable didn't re-run to set it.
        applyFilter(ti)
        reportFilter()
        const cols = filterStateRef.current[ti]
        const isActive = !!(cols && cols[ci] && cols[ci].size > 0)
        // Toggle the ▼ active state on every copy of this column's button — the
        // live header AND the floating-header clone (which may be the one clicked).
        host
          .querySelectorAll('.km-filter-btn[data-ti="' + ti + '"][data-ci="' + ci + '"]')
          .forEach((b) => b.classList.toggle('active', isActive))
        document
          .querySelectorAll('.km-float-header .km-filter-btn[data-ti="' + ti + '"][data-ci="' + ci + '"]')
          .forEach((b) => b.classList.toggle('active', isActive))
        // Hiding rows can reflow column widths — re-measure the floating header so
        // it stays aligned with the (now narrower/wider) live table.
        tableScrollRef.current?.update()
      }
      document.body.appendChild(pop)
      activePopRef.current = pop
      activePopBtnRef.current = btn
      repositionFilterPop()
    }
    const applyFilterRows = (ti, rows, clearWhenEmpty = false) => {
      const cols = filterStateRef.current[ti] || {}
      const keys = Object.keys(cols)
      if (!keys.length && !clearWhenEmpty) return
      rows.forEach((tr) => {
        let hide = false
        keys.forEach((ci) => {
          const td = tr.children[ci]
          let v = (td?.getAttribute('data-raw') || '').trim()
          if (v === '') v = '(空白)'
          if (cols[ci].has(v)) hide = true
        })
        tr.classList.toggle('km-filtered', hide)
      })
    }
    const applyFilter = (ti) => {
      const table = host.querySelector('table[data-ti="' + ti + '"]')
      if (!table) return
      applyFilterRows(ti, table.querySelectorAll('tbody tr'), true)
    }
    // A table's filters are active only if some column holds a non-empty excluded
    // set (openFilterPop pre-creates an empty per-table object even on cancel).
    const tableHasFilter = (ti) => {
      const cols = filterStateRef.current[ti]
      return !!cols && Object.keys(cols).length > 0
    }
    // Drop every filter on one table (right-click menu) / on the whole document
    // (status-bar badge). Display-only, like the filters themselves: un-hide the
    // rows, un-mark the ▼ buttons (live header + floating clone), refresh the
    // shown/total badge. closePop() guards against a stale open dropdown whose
    // checkbox state was captured before the clear.
    const clearTableFilter = (ti) => {
      if (!tableHasFilter(ti)) return
      closePop()
      delete filterStateRef.current[ti]
      applyFilter(ti)
      const sel = '.km-filter-btn[data-ti="' + ti + '"]'
      host.querySelectorAll(sel).forEach((b) => b.classList.remove('active'))
      document
        .querySelectorAll('.km-float-header ' + sel)
        .forEach((b) => b.classList.remove('active'))
      reportFilter()
      tableScrollRef.current?.update()
    }
    const clearAllFilters = () => {
      const tis = Object.keys(filterStateRef.current).filter((ti) => tableHasFilter(ti))
      if (!tis.length) return
      closePop()
      filterStateRef.current = {}
      tis.forEach((ti) => applyFilter(parseInt(ti)))
      host.querySelectorAll('.km-filter-btn').forEach((b) => b.classList.remove('active'))
      document
        .querySelectorAll('.km-float-header .km-filter-btn')
        .forEach((b) => b.classList.remove('active'))
      reportFilter()
      tableScrollRef.current?.update()
    }

    // Classify a clicked link: allowlisted web/mail targets → system browser;
    // in-app doc link or pure #anchor → hand the (path, anchor, fromPath) to the
    // parent so it opens the markdown tab and jumps. Unknown schemes are blocked
    // here and again by the main-process permission boundary.
    const activateLink = (href, { openRight = false } = {}) => {
      if (/^(https?:|mailto:)/i.test(href)) {
        window.api?.openExternal?.(href)
        return
      }
      const target = parseInternalDocLink(href)
      if (!target) return
      onOpenDocLinkRef.current?.(target.path, target.anchor, docPathRef.current, { openRight })
    }
    const decorateInternalLink = (link) => {
      if (!link || !host.contains(link)) return
      const target = internalLinkTarget(link.getAttribute('href'), docPathRef.current)
      if (!target?.label) return
      const translate = tRef.current
      link.title = `${translate('links.hoverTarget', { target: target.label })}\n${translate('links.openRightHint')}`
    }

    // ── event delegation on the host container ──
    let linkTimerRef = null // pending single-click link-open (cancelled by dblclick)
    let lastInteractedBi = -1
    const trackInteraction = (target) => {
      const block = target?.closest?.('.km-block[data-bi]')
      if (block && host.contains(block)) lastInteractedBi = Number(block.getAttribute('data-bi'))
    }
    const onDblClick = (e) => {
      trackInteraction(e.target)
      clearTimeout(linkTimerRef) // a double-click is an edit, not a link navigation
      if (e.target.closest('.km-collapse-toggle')) return // a fold toggle, not an edit
      if (sourceSplitModeRef.current) {
        const cell = e.target.closest('td, th')
        const block = e.target.closest('.km-block[data-bi]')
        const cellLine = Number(cell?.getAttribute('data-line'))
        const bi = Number(block?.getAttribute('data-bi'))
        const blockLine = Number.isFinite(bi) ? blocksRef.current[bi]?.start : null
        const line = Number.isFinite(cellLine) ? cellLine : blockLine
        if (Number.isFinite(line)) {
          e.preventDefault()
          onLocateSourceRef.current?.(line)
          return
        }
      }
      // Edit any table cell — body (<td>) or header (<th>). The filter ▼ lives in
      // the header; a double-click on it is a filter toggle, not a cell edit.
      const cell = e.target.closest('td, th')
      if (cell && host.contains(cell) && !e.target.closest('.km-filter-btn')) {
        selectCell(cell)
        openCellPop(cell)
        return
      }
      // Double-clicking the highlighted area of an editable (non-table) block
      // enters source edit — same affordance as the pencil button. The guard
      // (a direct `.km-src-edit` child) excludes tables and skips a block that's
      // already editing, where the button is replaced by the textarea.
      const block = e.target.closest('.km-block')
      if (block && host.contains(block) && block.querySelector(':scope > .km-src-edit')) {
        startBlockEdit(parseInt(block.getAttribute('data-bi')))
      }
    }
    const onTaskChange = (e) => {
      const checkbox = e.target.closest?.('.km-task-cb[data-line]')
      if (!checkbox || !host.contains(checkbox)) return
      const lineIdx = Number(checkbox.getAttribute('data-line'))
      if (!Number.isInteger(lineIdx)) return
      const checked = checkbox.checked
      // A pending editor owns the document until it is confirmed/discarded.
      // Restore the old visual state while the shared draft prompt is open; the
      // requested task state is applied only after that decision.
      if (activeCellPopRef.current || activeBlockEditRef.current) checkbox.checked = !checked
      openAfterClose(() => toggleTaskAt(lineIdx, checked))
    }
    const onClick = (e) => {
      trackInteraction(e.target)
      const clickedCell = e.target.closest('td, th')
      if (clickedCell && host.contains(clickedCell)) selectCell(clickedCell)
      else if (!e.target.closest('.km-collapse-toggle, .hm-embed-zoom, .km-src-edit')) {
        clearTableSelection()
      }
      const zoomButton = e.target.closest('.hm-embed-zoom')
      if (zoomButton && host.contains(zoomButton)) {
        const item = zoomItemFromButton(zoomButton)
        if (item) {
          e.preventDefault()
          e.stopPropagation()
          setLightbox(item)
        }
        return
      }
      // Fold/unfold a heading's section. Handled first so it never falls through to
      // link-open or block-edit; stopPropagation keeps the block hover-edit quiet.
      const ct = e.target.closest('.km-collapse-toggle')
      if (ct) {
        e.stopPropagation()
        const head = ct.closest('.km-block[data-hlevel]')
        if (head) toggleSection(head)
        return
      }
      // A plain click on a link opens it (keep mode is a read-only preview). The
      // open is deferred briefly and cancelled by a following dblclick, so
      // double-clicking a cell/block that contains a link still enters edit. Skip
      // when a drag selection is active (don't navigate on select-ends-on-link).
      const a = e.target.closest('a')
      if (a && host.contains(a) && !e.shiftKey && (window.getSelection()?.isCollapsed ?? true)) {
        const href = a.getAttribute('href')
        if (href && href !== '#') {
          e.preventDefault()
          clearTimeout(linkTimerRef)
          const openRight = e.altKey
          linkTimerRef = setTimeout(() => activateLink(href, { openRight }), 230)
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
        // Toggle: clicking the same ▼ that opened the dropdown closes it.
        if (activePopRef.current && activePopBtnRef.current === fb) closePop()
        else openFilterPop(fb)
      }
    }
    // Right-click anywhere in the document → context menu. A drag selection wins
    // (copy selection / open source at its start); else a table cell shows copy +
    // open-source + its row/column ops; else a plain block shows copy + open-source.
    const onContextMenu = (e) => {
      trackInteraction(e.target)
      const T = tRef.current
      const sel = window.getSelection()
      const hasSel =
        sel && !sel.isCollapsed && host.contains(sel.anchorNode) && host.contains(sel.focusNode)
      const items = []
      if (hasSel) {
        const line = lineForBlock(blockOfNode(sel.getRangeAt(0).startContainer))
        items.push({ label: T('keep.copySel'), fn: () => copySelection(sel) })
        items.push({ label: T('keep.openSource'), fn: () => openSourceAt(line) })
      } else {
        const link = e.target.closest('a')
        if (link && host.contains(link)) {
          const block = link.closest('.km-block')
          const href = link.getAttribute('href') || ''
          if (parseInternalDocLink(href)) {
            items.push({
              label: T('links.openRight'),
              fn: () => activateLink(href, { openRight: true })
            })
          }
          items.push({
            label: T('links.findReferences'),
            fn: () => onFindReferencesRef.current?.({
              type: 'link',
              href,
              line: lineForBlock(block) + 1
            })
          })
          items.push('sep')
        }
        const cell = e.target.closest('td, th')
        if (cell && host.contains(cell)) {
          const table = cell.closest('table.km-table')
          if (!table) return
          selectCell(cell)
          items.push(...tableItemsForCell(cell))
        } else {
          const block = e.target.closest('.km-block')
          if (!block || !host.contains(block)) return
          const bi = Number(block.getAttribute('data-bi'))
          const line = lineForBlock(block)
          items.push({ label: T('keep.copy'), fn: () => copyElement(block) })
          items.push({ label: T('keep.openSource'), fn: () => openSourceAt(line) })
          const sourceBlock = blocksRef.current[bi]
          if (sourceBlock?.type === 'heading') {
            items.push('sep')
            items.push({
              label: T('links.findReferences'),
              fn: () => onFindReferencesRef.current?.({
                type: 'heading',
                line: sourceBlock.start + 1,
                text: sourceBlock.text
              })
            })
            items.push({
              label: T('links.renameHeading'),
              fn: () => onRenameHeadingRef.current?.({
                type: 'heading',
                line: sourceBlock.start + 1,
                text: sourceBlock.text
              })
            })
          }
          if (structuralBlock(bi)) {
            items.push('sep')
            items.push({
              label: T('keep.blockInsertAbove'),
              fn: () => performBlockCommand('insertAbove', bi)
            })
            items.push({
              label: T('keep.blockInsertBelow'),
              fn: () => performBlockCommand('insertBelow', bi)
            })
            items.push({
              label: T('keep.blockDuplicate'),
              fn: () => performBlockCommand('duplicate', bi)
            })
            items.push({
              label: T('keep.blockDelete'),
              fn: () => performBlockCommand('delete', bi)
            })
          }
        }
      }
      if (!items.length) return
      e.preventDefault()
      openMenu(e.clientX, e.clientY, items)
    }
    // Close the filter dropdown / context menu on an outside click. A cell editor
    // is NOT auto-committed here: it stays open like a block source editor and is
    // only closed via its own buttons/Esc, or with a save prompt when another
    // editor opens (openAfterClose) — one consistent "one edit bar" rule.
    const onDocDown = (e) => {
      if (
        activePopRef.current &&
        !activePopRef.current.contains(e.target) &&
        !e.target.classList.contains('km-filter-btn')
      ) {
        closePop()
      }
      if (activeMenuRef.current && !activeMenuRef.current.contains(e.target)) closeMenu()
    }
    const onEsc = (e) => {
      if (e.key !== 'Escape') return
      if (activeConfirmRef.current) closeConfirm() // Esc on the modal = cancel
      else if (activeMenuRef.current) closeMenu()
      else if (activePopRef.current) closePop()
      else if (selectedCellRef.current) clearTableSelection({ focusTable: true })
    }
    const onLinkHover = (e) => {
      decorateInternalLink(e.target.closest?.('a[href]'))
    }
    const onFocusIn = (e) => {
      const cell = e.target.closest?.('td, th')
      if (cell && host.contains(cell)) {
        if (!cell.classList.contains('km-cell-selected')) selectCell(cell, { focus: false })
        return
      }
      const table = e.target.closest?.('table.km-table')
      if (table && host.contains(table)) {
        const first = visibleCellInRow(table.tHead?.rows?.[0], 0, 1)
        if (first) selectCell(first)
      }
    }
    const onTableKeyDown = (e) => {
      if (!e.target.closest?.('table.km-table')) return
      const cell = resolveSelection()
      if (!cell) return
      let handled = false
      if (e.key === 'Enter' || e.key === 'F2') {
        handled = performTableCommand('edit')
      } else if (e.altKey && e.key === 'ArrowDown') {
        handled = performTableCommand('filter')
      } else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
        handled = performTableCommand('menu')
      } else if (e.key === 'ArrowLeft') handled = moveSelectedCell('left')
      else if (e.key === 'ArrowRight') handled = moveSelectedCell('right')
      else if (e.key === 'ArrowUp') handled = moveSelectedCell('up')
      else if (e.key === 'ArrowDown') handled = moveSelectedCell('down')
      else if (e.key === 'Tab') {
        handled = moveSelectedCell(e.shiftKey ? 'previous' : 'next')
      } else if (e.key === 'Escape') {
        const dismissedOverlay = Boolean(activeMenuRef.current || activePopRef.current)
        if (activeMenuRef.current) closeMenu()
        else if (activePopRef.current) closePop()
        else clearTableSelection({ focusTable: true })
        if (dismissedOverlay) {
          queueMicrotask(() => {
            const selected = resolveSelection()
            selected?.focus({ preventScroll: true })
          })
        }
        handled = true
      }
      if (!handled) return
      e.preventDefault()
      e.stopPropagation()
    }
    // Scrolling abandons an open right-click menu (its anchor moved away). The
    // cell editor stays open on purpose (it may hold unsaved edits) and is
    // re-anchored to its cell so it tracks the cell instead of drifting.
    const onScroll = () => {
      closeMenu()
      repositionCellPop()
      repositionFilterPop()
      tableScrollRef.current?.update()
    }
    const onResize = () => {
      repositionCellPop()
      repositionFilterPop()
      tableScrollRef.current?.update()
    }

    // Hide body-level UI when this pane leaves view. A cell edit is suspended,
    // not destroyed: switching tabs must never silently discard an unfinished
    // value. It is restored when the pane becomes visible again.
    suspendFloatingRef.current = () => {
      closePop()
      closeMenu()
      closeConfirm()
      if (activeCellPopRef.current) activeCellPopRef.current.pop.style.display = 'none'
      tableScrollRef.current?.hide() // a fixed floating header would otherwise linger
    }
    resumeFloatingRef.current = () => {
      const cell = activeCellPopRef.current
      if (cell) {
        cell.pop.style.display = ''
        repositionCellPop()
      }
    }
    // Only worth re-measuring once the doc is fully streamed; mid-stream the next
    // chunk's finishRenderRange will measure the rest anyway (the host is visible again).
    remeasureRef.current = () => {
      if (!hasPendingWork()) applyMultilineFlagsRange(0, blocksRef.current.length)
    }
    rerenderRef.current = () => rerender()

    host.addEventListener('dblclick', onDblClick)
    host.addEventListener('click', onClick)
    host.addEventListener('change', onTaskChange)
    host.addEventListener('contextmenu', onContextMenu)
    host.addEventListener('mouseover', onLinkHover)
    host.addEventListener('copy', onCopy)
    host.addEventListener('paste', pasteIntoSelectedCells)
    host.addEventListener('focusin', onFocusIn)
    host.addEventListener('keydown', onTableKeyDown)
    document.addEventListener('click', onDocDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    rerender()

    const getScroller = () => host.closest('.editor-scroll')
    const blockIndexForOffset = (rawOffset) => {
      const markdown = rawLinesRef.current.join('\n')
      const { line } = lineColumnAtOffset(markdown, rawOffset)
      const blocks = blocksRef.current
      if (!blocks.length) return -1
      for (let i = 0; i < blocks.length; i++) {
        if (line >= blocks[i].start && line <= blocks[i].end) return i
        if (blocks[i].start > line) return i
      }
      return blocks.length - 1
    }
    const markdownOffsetFromViewportTop = (ensureAll = true) => {
      const scroller = getScroller()
      if (!scroller) return null
      if (ensureAll) flushRemaining()
      const scrollerTop = scroller.getBoundingClientRect().top + 8
      const blocks = [...host.querySelectorAll('.km-block[data-bi]')]
      const visible = blocks.find((block) => block.getBoundingClientRect().bottom >= scrollerTop) || blocks.at(-1)
      const bi = Number(visible?.getAttribute('data-bi'))
      const sourceBlock = Number.isFinite(bi) ? blocksRef.current[bi] : null
      if (sourceBlock?.type === 'table' && visible) {
        const thead = visible.querySelector('thead')
        const theadRect = thead?.getBoundingClientRect()
        // A Keep table is one block, but its cells already carry exact source
        // line numbers. Once the live header has scrolled above the viewport,
        // anchor to the first body row that is actually readable below the
        // floating header instead of always returning the table header line.
        if (theadRect && theadRect.bottom < scrollerTop) {
          const probeTop = scrollerTop + theadRect.height
          const rows = [...visible.querySelectorAll('tbody tr')]
            .filter((row) => row.getBoundingClientRect().height > 0)
          const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom >= probeTop) || rows.at(-1)
          const rowLine = Number(row?.querySelector('[data-line]')?.getAttribute('data-line'))
          if (Number.isFinite(rowLine)) {
            return lineStartOffset(rawLinesRef.current.join('\n'), rowLine)
          }
        }
      }
      return sourceBlock
        ? lineStartOffset(rawLinesRef.current.join('\n'), sourceBlock.start)
        : 0
    }
    const restoreMarkdownOffset = (rawOffset, follow = false) => {
      flushRemaining()
      const markdown = rawLinesRef.current.join('\n')
      const { line: sourceLine } = lineColumnAtOffset(markdown, rawOffset)
      const bi = blockIndexForOffset(rawOffset)
      const block = bi >= 0 ? host.querySelector(`.km-block[data-bi="${bi}"]`) : null
      const scroller = getScroller()
      if (!block || !scroller) return false
      revealHeading(block)
      const sourceBlock = blocksRef.current[bi]
      let target = block
      let topInset = 0
      if (sourceBlock?.type === 'table') {
        const rows = [...block.querySelectorAll('tbody tr')]
          .filter((row) => row.getBoundingClientRect().height > 0)
        target = rows.find((row) => Number(row.querySelector('[data-line]')?.getAttribute('data-line')) >= sourceLine)
          || rows.at(-1)
          || block
        topInset = block.querySelector('thead')?.getBoundingClientRect().height || 0
      }
      const blockRect = target.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      scroller.scrollTop += follow
        ? (blockRect.top + blockRect.bottom) / 2 - (scrollerRect.top + scrollerRect.bottom) / 2
        : blockRect.top - scrollerRect.top - topInset
      return true
    }
    const captureNavigationContext = () => {
      const collapsed = [...collapsedRef.current].slice(0, 50)
      const selection = selectedCellRef.current ? { ...selectedCellRef.current } : null
      let table = selection
        ? host.querySelector(`table.km-table[data-ti="${selection.ti}"]`)
        : null
      if (!table) {
        const rawOffset = markdownOffsetFromViewportTop(false)
        const bi = Number.isFinite(rawOffset) ? blockIndexForOffset(rawOffset) : -1
        table = bi >= 0
          ? host.querySelector(`.km-block[data-bi="${bi}"] table.km-table[data-ti]`)
          : null
      }
      if (!table) return { collapsed }

      const ti = Number(table.getAttribute('data-ti'))
      const wrap = table.closest('.km-table-wrap')
      const tableFilters = filterStateRef.current[ti] || {}
      const filterEntries = Object.entries(tableFilters)
        .filter(([, excluded]) => excluded instanceof Set && excluded.size)
        .map(([column, excluded]) => ({
          column: Number(column),
          excluded: [...excluded].map(String)
        }))
      const filterValueCount = filterEntries.reduce(
        (count, filter) => count + filter.excluded.length,
        0
      )
      return {
        collapsed,
        table: {
          ti,
          scrollLeft: wrap?.scrollLeft || 0,
          selection: selection?.ti === ti ? selection : null,
          restoreFilters: filterValueCount <= 200,
          filters: filterValueCount <= 200 ? filterEntries : undefined
        }
      }
    }
    const restoreNavigationContext = (context) => {
      if (!context || typeof context !== 'object') return false
      flushRemaining()
      if (Array.isArray(context.collapsed)) {
        collapsedRef.current = new Set(context.collapsed.slice(0, 50))
        applyCollapsed()
      }
      const tableContext = context.table
      if (!tableContext || !Number.isFinite(tableContext.ti)) return true
      const ti = Math.max(0, Math.floor(tableContext.ti))
      const table = host.querySelector(`table.km-table[data-ti="${ti}"]`)
      if (!table) return true

      if (tableContext.restoreFilters) {
        const nextFilters = {}
        for (const filter of tableContext.filters || []) {
          if (!Number.isFinite(filter?.column) || !Array.isArray(filter.excluded)) continue
          const excluded = new Set(filter.excluded.map(String))
          if (excluded.size) nextFilters[Math.max(0, Math.floor(filter.column))] = excluded
        }
        if (Object.keys(nextFilters).length) filterStateRef.current[ti] = nextFilters
        else delete filterStateRef.current[ti]
        applyFilter(ti)
        const syncButtons = (root) => {
          root
            .querySelectorAll?.(`.km-filter-btn[data-ti="${ti}"]`)
            .forEach((button) => {
              const column = Number(button.getAttribute('data-ci'))
              button.classList.toggle('active', !!nextFilters[column]?.size)
            })
        }
        syncButtons(host)
        document.querySelectorAll('.km-float-header').forEach(syncButtons)
        reportFilter()
      }

      const wrap = table.closest('.km-table-wrap')
      if (wrap && Number.isFinite(tableContext.scrollLeft)) {
        wrap.scrollLeft = Math.max(0, tableContext.scrollLeft)
      }
      if (tableContext.selection && tableContext.selection.ti === ti) {
        selectedCellRef.current = { ...tableContext.selection }
        restoreSelectedCell()
      } else if (selectedCellRef.current?.ti === ti) {
        clearTableSelection()
      }
      tableScrollRef.current?.update()
      return true
    }
    const replaceMarkdown = (markdown) => {
      if (destroyed) return false
      closeBlockEdit(false)
      closeCellPop()
      closePop()
      closeMenu()
      filterStateRef.current = {}
      columnStateRef.current = {}
      historyRef.current = { undo: [], redo: [] }
      reportHistory()
      applyRawLines(String(markdown ?? '').split('\n'), { record: false, emit: false })
      rerender()
      onFilterChangeRef.current?.(null)
      return true
    }
    const syncMarkdown = (markdown) => {
      if (destroyed || activeCellPopRef.current || activeBlockEditRef.current) return false
      const next = String(markdown ?? '').split('\n')
      if (rawLinesRef.current.join('\n') === next.join('\n')) return true
      closePop()
      closeMenu()
      filterStateRef.current = {}
      columnStateRef.current = {}
      selectedCellRef.current = null
      historyRef.current = { undo: [], redo: [] }
      reportHistory()
      applyRawLines(next, { record: false, emit: false })
      rerender()
      onFilterChangeRef.current?.(null)
      return true
    }
    const highlightMarkdownOffset = (rawOffset) => {
      host.querySelectorAll('.km-source-position').forEach((el) => el.classList.remove('km-source-position'))
      if (!Number.isFinite(rawOffset)) return false
      const bi = blockIndexForOffset(rawOffset)
      const block = bi >= 0 ? host.querySelector(`.km-block[data-bi="${bi}"]`) : null
      if (!block) return false
      revealHeading(block)
      block.classList.add('km-source-position')
      return true
    }
    const getReferenceContext = () => {
      const fallbackOffset = markdownOffsetFromViewportTop(false)
      const bi = lastInteractedBi >= 0
        ? lastInteractedBi
        : Number.isFinite(fallbackOffset)
          ? blockIndexForOffset(fallbackOffset)
          : -1
      const sourceBlock = bi >= 0 ? blocksRef.current[bi] : null
      const block = bi >= 0 ? host.querySelector(`.km-block[data-bi="${bi}"]`) : null
      const href = block?.querySelector('a[href]')?.getAttribute('href')
      if (href) {
        return { type: 'link', href, line: (sourceBlock?.start || 0) + 1 }
      }
      if (sourceBlock?.type === 'heading') {
        return {
          type: 'heading',
          line: sourceBlock.start + 1,
          text: sourceBlock.text
        }
      }
      return null
    }
    const insertMarkdown = (markdown) => {
      if (destroyed) return false
      const insert = String(markdown ?? '')
      if (!insert) return false
      const blockEdit = activeBlockEditRef.current?.ta
      const cellEdit = activeCellPopRef.current?.pop?.querySelector('textarea')
      const textarea = blockEdit?.isConnected ? blockEdit : cellEdit?.isConnected ? cellEdit : null
      if (textarea) {
        const start = textarea.selectionStart ?? textarea.value.length
        textarea.setRangeText(insert, start, textarea.selectionEnd ?? start, 'end')
        textarea.focus()
        return true
      }

      const raw = rawLinesRef.current.join('\n')
      const eol = raw.includes('\r\n') ? '\r\n' : '\n'
      const block = blocksRef.current[lastInteractedBi]
      const at = block ? lineStartOffset(raw, block.end + 1) : raw.length
      const before = raw.slice(0, at)
      const after = raw.slice(at)
      let payload = insert.replace(/\r?\n/g, eol)
      if (before) {
        if (before.endsWith(eol + eol)) {
          // already separated
        } else if (before.endsWith(eol)) payload = eol + payload
        else payload = eol + eol + payload
      }
      if (after) payload += after.startsWith(eol) ? eol : eol + eol
      else if (raw.endsWith(eol)) payload += eol
      applyRawLines((before + payload + after).split('\n'))
      rerender()
      return true
    }

    const performHistory = (direction) => {
      if (destroyed || activeCellPopRef.current || activeBlockEditRef.current) return false
      const from = direction === 'undo' ? 'undo' : 'redo'
      const to = direction === 'undo' ? 'redo' : 'undo'
      const entry = historyRef.current[from].pop()
      if (!entry) return false
      historyRef.current[to] = pushKeepHistory(historyRef.current[to], entry)
      reportHistory()
      rawLinesRef.current = applyKeepHistoryEntry(rawLinesRef.current, entry, direction)
      viewLinesRef.current = toViewLines(rawLinesRef.current)
      // Structural table changes can invalidate column/filter indices. Clearing
      // preview-only table state makes every history step deterministic.
      filterStateRef.current = {}
      columnStateRef.current = {}
      emitChange()
      rerender()
      onFilterChangeRef.current?.(null)
      return true
    }

    const focusDraft = () => {
      const cell = activeCellPopRef.current
      if (cell) {
        cell.pop.style.display = ''
        repositionCellPop()
        cell.pop.querySelector('textarea')?.focus()
        return true
      }
      const block = activeBlockEditRef.current?.ta
      if (block) {
        block.focus()
        return true
      }
      return false
    }

    onReady?.({
      getMarkdown: () => rawLinesRef.current.join('\n'),
      getScroller,
      replaceMarkdown,
      syncMarkdown,
      highlightMarkdownOffset,
      getReferenceContext,
      insertMarkdown,
      tableCommand: (command) => performTableCommand(command),
      hasTableSelection: () => !!resolveSelection(),
      blockCommand: (command) => performBlockCommand(command),
      replaceLineRange: (start, deleteCount, insertedLines) => {
        const changed = applyRawPatch(start, deleteCount, insertedLines, {
          meta: {
            kind: 'restore',
            target: { line: start + 1 },
            summaryKey: 'keep.changeRestore'
          }
        })
        if (!changed) return false
        filterStateRef.current = {}
        columnStateRef.current = {}
        rerender()
        onFilterChangeRef.current?.(null)
        return true
      },
      undo: () => performHistory('undo'),
      redo: () => performHistory('redo'),
      hasDraft: () => !!(activeCellPopRef.current || activeBlockEditRef.current),
      focusDraft,
      selectionLineRange,
      markdownOffsetFromSelection: () => {
        const lines = selectionLineRange()
        return lines ? lineStartOffset(rawLinesRef.current.join('\n'), lines.start) : null
      },
      markdownOffsetFromViewportTop,
      navigationOffsetFromViewportTop: () => markdownOffsetFromViewportTop(false),
      restoreMarkdownOffset,
      captureNavigationContext,
      restoreNavigationContext,
      isSelectionVisible: () => !!currentSelectionRange(),
      // PDF export: a clean snapshot without the edit affordances / filter ▼. The
      // export render leaves mermaid/math as empty placeholders (they fill async in
      // the live DOM), so copy each already-rendered diagram/formula across by index
      // — both come from the same rawLines, so the Nth placeholder matches.
      getDocHTML: () => {
        flushRemaining() // the by-index embed copy below needs every live placeholder present
        const tmp = document.createElement('div')
        tmp.innerHTML = renderDoc(
          rawLinesRef.current,
          {},
          {
            forExport: true,
            baseDir: dirOf(docPathRef.current),
            blankLineSpacing: blankLineSpacingRef.current
          }
        ).html
        // Embeds now render lazily (only when scrolled near view), so the live host
        // may not hold a diagram the export needs. Fill mermaid from the shared
        // session cache first (covers anything ever rendered), then copy the live
        // DOM by index for whatever the cache misses / for math.
        tmp.querySelectorAll('.km-mermaid').forEach((el) => {
          const c = peekMermaidSvg(el.getAttribute('data-code') || '')
          if (c && c.svg) el.innerHTML = c.svg
        })
        const inject = (sel) => {
          const live = [...host.querySelectorAll(sel)]
          ;[...tmp.querySelectorAll(sel)].forEach((el, i) => {
            if (live[i] && live[i].innerHTML) el.innerHTML = live[i].innerHTML
          })
        }
        inject('.km-mermaid')
        inject('.km-math')
        return tmp.innerHTML
      },
      setBlock: () => {}, // no block model in keep mode
      // Status-bar filter badge click: drop every table filter in the document.
      clearAllFilters: () => clearAllFilters(),
      // Paint any not-yet-streamed chunks NOW. App calls this before an outline jump
      // or a find run, both of which query the live DOM and would otherwise miss a
      // heading / match still sitting in an un-appended chunk.
      ensureRendered: () => flushRemaining(),
      // Outline jump: if the target heading is buried in a collapsed section, expand
      // its ancestors first so App's scrollIntoView lands on a visible element.
      revealHeading: (el) => revealHeading(el)
    })

    return () => {
      destroyed = true
      cancelAfterPaint()
      cancelChunks() // abandon any in-flight progressive-render stream
      if (embedObserver) embedObserver.disconnect()
      clearTimeout(linkTimerRef)
      closePop()
      closeMenu()
      closeConfirm()
      closeCellPop()
      clearTableSelection()
      tableScrollRef.current?.destroy() // remove body-appended floating headers
      tableScrollRef.current = null
      activeBlockEditRef.current = null // drop block-edit tracking (host is torn down)
      onDraftChangeRef.current?.(false)
      onHistoryChangeRef.current?.({ canUndo: false, canRedo: false })
      onFilterChangeRef.current?.(null) // drop this tab's filter badge on unmount
      host.removeEventListener('dblclick', onDblClick)
      host.removeEventListener('click', onClick)
      host.removeEventListener('change', onTaskChange)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('mouseover', onLinkHover)
      host.removeEventListener('copy', onCopy)
      host.removeEventListener('paste', pasteIntoSelectedCells)
      host.removeEventListener('focusin', onFocusIn)
      host.removeEventListener('keydown', onTableKeyDown)
      document.removeEventListener('click', onDocDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When this tab's pane leaves view (sidebar file click, tab switch, split
  // close), the wrapper goes display:none — but the floating popovers are
  // appended to document.body, so they'd keep showing over the next document.
  // Suspend them here. A still-open block source editor lives inside the hidden
  // host; a body-appended cell editor is hidden and restored without losing text.
  const wasHiddenRef = useRef(false)
  useEffect(() => {
    if (!inView) {
      wasHiddenRef.current = true
      suspendFloatingRef.current?.()
      setLightbox(null)
    } else if (wasHiddenRef.current) {
      // Only after a hide → show: fix km-multiline on blocks that streamed in while
      // the pane was display:none (they measured 0 height). Skips the no-op remeasure
      // on the very first mount, where the pane was visible the whole time.
      remeasureRef.current?.()
      resumeFloatingRef.current?.()
    }
  }, [inView])

  // Blank-line spacing is baked into the block markup (`data-gap`), not just styled,
  // so flipping the setting has to repaint. Skip the mount pass — the []-deps effect
  // above already rendered with the current value.
  const spacingMountedRef = useRef(false)
  useEffect(() => {
    if (!spacingMountedRef.current) {
      spacingMountedRef.current = true
      return
    }
    rerenderRef.current?.()
  }, [blankLineSpacing])

  // Hot-swap the static "edit source" labels when the UI language changes. The
  // doc HTML is rendered once on mount (rerender lives in a []-deps effect), so
  // the baked-in labels would otherwise stay in the original language. Patch them
  // in place instead of re-rendering, to preserve any active edit/filter state.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const label = tRef.current('keep.editSource')
    host.querySelectorAll('.km-src-edit').forEach((btn) => {
      btn.title = label
      const span = btn.querySelector('span')
      if (span) span.textContent = label
    })
    ensureEmbedZoomButtons(host, tRef.current)
    tableScrollRef.current?.refreshLabels(tRef.current)
  }, [lang])

  return (
    <>
      <div className="km-doc" ref={hostRef} />
      <ZoomLightbox item={lightbox} onClose={() => setLightbox(null)} t={t} />
    </>
  )
}

// Tiny local escapers (avoid importing if tree-shaking matters; mirror parser).
function escapeHtmlLocal(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttrLocal(s) {
  return escapeHtmlLocal(s).replace(/"/g, '&quot;')
}

// Memoized: App re-renders per keystroke; with per-tab handlers cached by App,
// a mounted-but-inactive keep tab (this is a 1400-line hook body) skips
// entirely. Shallow compare — initialContent/docPath/inView changes must and do
// pass through; external reloads remount via the key's reloadNonce.
export default memo(KeepEditor)
